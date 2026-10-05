import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { api, resolveAssetUrl } from '@/lib/api'
import { fetchGeneralSettings, formatCurrencyAmount } from '@/lib/restaurantSettings'
import { useAuth } from '@/context/authcontext'

// ── Design Tokens & Colors ─────────────────────────────────────────────────
const THEME = {
  gold: '#f5c842',
  goldHover: '#ffd966',
  background: '#090807',
  cardBackground: '#13110e',
  textLight: '#f6f4ee',
  textMuted: 'rgba(246, 244, 238, 0.52)',
  borderLine: 'rgba(255, 255, 255, 0.08)',
  spicyRed: '#ef4444',
  successGreen: '#22c55e',
}

const NAVBAR_HEIGHT = 68
const SLIDESHOW_INTERVAL_MS = 4000
const MAXIMUM_HERO_SLIDES = 8
const MAXIMUM_FEEDBACK_CHARACTERS = 200

const MENU_CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'] as const
type Category = (typeof MENU_CATEGORIES)[number]
type SortOption = 'featured' | 'rating' | 'price-asc' | 'price-desc'

// ── Data Interfaces ────────────────────────────────────────────────────────
interface Product {
  id: number
  name: string
  category: Category
  rating: number
  badge: string
  description: string
  price: number
  spicy: boolean
  img: string
}

interface Flavor {
  name: string
  accent?: string
  desc: string
  img: string
}

interface MenuItem {
  name: string
  price: number
  tag?: string
  img?: string
}

interface MenuSection {
  id: string
  title: string
  subtext?: string
  items: MenuItem[]
}

interface PromoOffer {
  id: string
  title: string
  subtitle?: string
  description: string
  img: string
  badge?: string
  validUntil?: string
  discount?: string
  highlight?: boolean
}

interface ProductsPageProps {
  isAuthenticated?: boolean
  onLogout?: () => void
}

// ── Screen Size & Responsive Hook ──────────────────────────────────────────
function useScreenBreakpoints() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  useEffect(() => {
    const handleWindowResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  return {
    isMobile: windowWidth < 680,
    isTablet: windowWidth < 1024,
    isDesktop: windowWidth >= 1024,
  }
}

// ── Clean Helper Functions ─────────────────────────────────────────────────
const formatPrice = (amountInPesos: number): string => formatCurrencyAmount(amountInPesos)

const normalizeCategoryName = (rawCategoryName: unknown): Category => {
  const categoryString = String(rawCategoryName ?? '').toLowerCase()
  if (categoryString.includes('drink') || categoryString.includes('beverage') || categoryString.includes('soda')) return 'Drinks'
  if (categoryString.includes('side')) return 'Sides'
  if (categoryString.includes('combo')) return 'Combos'
  if (categoryString.includes('chicken') || categoryString.includes('rice meal') || categoryString.includes('menu food') || categoryString.includes('wing')) return 'Chicken'
  return 'All'
}

const mapApiProductsToApp = (apiDataList: unknown[]): Product[] => {
  if (!Array.isArray(apiDataList)) return []
  return apiDataList
    .map((rawItem: any) => ({
      id: Number(rawItem?.id ?? rawItem?.product_id ?? 0),
      name: String(rawItem?.name ?? rawItem?.product_name ?? '').trim(),
      category: normalizeCategoryName(rawItem?.category),
      rating: Number(rawItem?.rating ?? 0),
      badge: String(rawItem?.badge ?? '').trim(),
      description: String(rawItem?.description ?? '').trim(),
      price: Number(rawItem?.price ?? 0),
      spicy: Boolean(rawItem?.spicy),
      img: typeof (rawItem?.image ?? rawItem?.img) === 'string' && String(rawItem?.image ?? rawItem?.img).trim()
        ? resolveAssetUrl(String(rawItem?.image ?? rawItem?.img).trim())
        : '',
    }))
    .filter(product => product.id > 0 && product.name.length > 0)
}

const calculateTimeRemaining = (expirationDateString?: string): string | null => {
  if (!expirationDateString) return null
  const differenceMilliseconds = new Date(expirationDateString).getTime() - Date.now()
  if (differenceMilliseconds <= 0) return null

  const daysRemaining = Math.floor(differenceMilliseconds / (1000 * 60 * 60 * 24))
  if (daysRemaining > 30) return null
  if (daysRemaining > 0) return `${daysRemaining} DAYS LEFT`

  const hoursRemaining = Math.floor(differenceMilliseconds / (1000 * 60 * 60))
  return `${hoursRemaining} HOURS LEFT`
}

// ── Reusable Safe Image Component ──────────────────────────────────────────
function SafeImage({ src, alt }: { src?: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: '#161411',
          color: THEME.textMuted,
          fontSize: 11,
          letterSpacing: '0.08em',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        The Crunch
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setIsLoaded(true)}
      onError={() => setHasError(true)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        opacity: isLoaded ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    />
  )
}

// ── Hero Slideshow Component ───────────────────────────────────────────────
function HeroSlideshow({
  slides,
  onOrderClick,
}: {
  slides: Product[]
  onOrderClick: () => void
}) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const userPrefersReducedMotion = useReducedMotion()

  const totalSlidesCount = slides.length
  const currentSlide = slides[Math.min(activeSlideIndex, totalSlidesCount - 1)]

  useEffect(() => {
    slides.forEach(slide => {
      if (slide.img) {
        const imagePreloader = new Image()
        imagePreloader.src = slide.img
      }
    })
  }, [slides])

  useEffect(() => {
    if (totalSlidesCount < 2 || isPaused || userPrefersReducedMotion) return
    const timerId = setInterval(() => {
      setActiveSlideIndex(previousIndex => (previousIndex + 1) % totalSlidesCount)
    }, SLIDESHOW_INTERVAL_MS)
    return () => clearInterval(timerId)
  }, [totalSlidesCount, isPaused, userPrefersReducedMotion])

  const navigateSlide = (direction: 1 | -1) => {
    setActiveSlideIndex(previousIndex => (previousIndex + direction + totalSlidesCount) % totalSlidesCount)
  }

  if (!currentSlide) return null

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative',
        aspectRatio: '4/3',
        width: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: THEME.cardBackground,
        border: `1px solid ${THEME.borderLine}`,
        boxShadow: '0 24px 50px -15px rgba(0,0,0,0.85)',
      }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={currentSlide.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <SafeImage src={currentSlide.img} alt={currentSlide.name} />
        </motion.div>
      </AnimatePresence>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(9,8,7,0.95) 0%, rgba(9,8,7,0.3) 45%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 3, display: 'flex', gap: 6 }}>
        {currentSlide.badge ? (
          <span style={pillBadgeStyle(THEME.gold, '#120d04')}>{currentSlide.badge}</span>
        ) : (
          <span style={pillBadgeStyle('rgba(255,255,255,0.08)', THEME.textLight)}>FEATURED</span>
        )}
        {currentSlide.spicy && (
          <span style={pillBadgeStyle('rgba(239,68,68,0.2)', '#f87171', 'rgba(239,68,68,0.4)')}>SPICY</span>
        )}
      </div>

      <span
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 3,
          fontSize: 11,
          fontWeight: 700,
          color: THEME.textMuted,
          backgroundColor: 'rgba(9, 8, 7, 0.65)',
          padding: '4px 8px',
          borderRadius: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(activeSlideIndex + 1).padStart(2, '0')} / {String(totalSlidesCount).padStart(2, '0')}
      </span>

      {totalSlidesCount > 1 && (
        <>
          <button onClick={() => navigateSlide(-1)} aria-label="Previous Slide" style={slideArrowButtonStyle('left')}>
            ‹
          </button>
          <button onClick={() => navigateSlide(1)} aria-label="Next Slide" style={slideArrowButtonStyle('right')}>
            ›
          </button>
        </>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 3,
          padding: 22,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: THEME.textLight,
            }}
          >
            {currentSlide.name}
          </h3>
          <p style={{ fontSize: 17, fontWeight: 800, color: THEME.gold, marginTop: 2 }}>
            {formatPrice(currentSlide.price)}
          </p>

          {totalSlidesCount > 1 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  onClick={() => setActiveSlideIndex(slideIndex)}
                  style={{
                    height: 4,
                    width: slideIndex === activeSlideIndex ? 22 : 5,
                    borderRadius: 2,
                    border: 0,
                    padding: 0,
                    backgroundColor: slideIndex === activeSlideIndex ? THEME.gold : 'rgba(255,255,255,0.25)',
                    cursor: 'pointer',
                    transition: 'all 0.25s',
                  }}
                  aria-label={`Slide ${slideIndex + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onOrderClick}
          style={{ ...solidGoldButtonStyle, flexShrink: 0, padding: '10px 20px', fontSize: 13 }}
        >
          ORDER NOW
        </button>
      </div>
    </div>
  )
}

// ── Product Card Component ─────────────────────────────────────────────────
function ProductCard({
  product,
  onOrderClick,
}: {
  product: Product
  onOrderClick: () => void
}) {
  return (
    <article
      style={{
        backgroundColor: THEME.cardBackground,
        border: `1px solid ${THEME.borderLine}`,
        borderRadius: 18,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3', backgroundColor: '#151310', overflow: 'hidden' }}>
        <SafeImage src={product.img} alt={product.name} />

        {product.badge && (
          <span style={{ ...pillBadgeStyle(THEME.gold, '#120d04'), position: 'absolute', top: 12, left: 12 }}>
            {product.badge}
          </span>
        )}
        {product.spicy && (
          <span
            style={{
              ...pillBadgeStyle('rgba(239,68,68,0.2)', '#f87171', 'rgba(239,68,68,0.4)'),
              position: 'absolute',
              top: 12,
              right: 12,
            }}
          >
            SPICY
          </span>
        )}
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: THEME.textLight }}>
            {product.name}
          </h3>
          {product.rating > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: THEME.gold }}>
              ★ {product.rating.toFixed(1)}
            </span>
          )}
        </div>

        {product.description && (
          <p
            style={{
              fontSize: 12.5,
              color: THEME.textMuted,
              lineHeight: 1.55,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flex: 1,
            }}
          >
            {product.description}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${THEME.borderLine}`,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 800, color: THEME.textLight }}>
            {formatPrice(product.price)}
          </span>
          <button onClick={onOrderClick} style={{ ...solidGoldButtonStyle, padding: '7px 15px', fontSize: 12 }}>
            ORDER
          </button>
        </div>
      </div>
    </article>
  )
}

// ── Promo Card Component ───────────────────────────────────────────────────
function PromoCard({ promo }: { promo: PromoOffer }) {
  const timeRemainingText = calculateTimeRemaining(promo.validUntil)

  return (
    <article
      style={{
        backgroundColor: THEME.cardBackground,
        border: `1px solid ${promo.highlight ? 'rgba(245,200,66,0.4)' : THEME.borderLine}`,
        borderRadius: 18,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', backgroundColor: '#151310', overflow: 'hidden' }}>
        <SafeImage src={promo.img ? resolveAssetUrl(promo.img) : ''} alt={promo.title} />

        {promo.badge && (
          <span style={{ ...pillBadgeStyle(THEME.gold, '#120d04'), position: 'absolute', top: 12, left: 12 }}>
            {promo.badge}
          </span>
        )}
        {promo.discount && (
          <span style={{ ...pillBadgeStyle(THEME.gold, '#120d04'), position: 'absolute', bottom: 12, right: 12 }}>
            {promo.discount}
          </span>
        )}
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.textLight }}>{promo.title}</h3>
        {promo.subtitle && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: THEME.gold }}>{promo.subtitle}</p>
        )}
        <p style={{ fontSize: 12.5, color: THEME.textMuted, lineHeight: 1.5 }}>{promo.description}</p>
        {timeRemainingText && (
          <span
            style={{
              ...pillBadgeStyle('rgba(239,68,68,0.15)', '#f87171', 'rgba(239,68,68,0.3)'),
              alignSelf: 'flex-start',
              marginTop: 6,
            }}
          >
            {timeRemainingText}
          </span>
        )}
      </div>
    </article>
  )
}

// ── Menu Board Section ─────────────────────────────────────────────────────
function MenuBoardSection({ section }: { section: MenuSection }) {
  return (
    <div
      style={{
        backgroundColor: THEME.cardBackground,
        border: `1px solid ${THEME.borderLine}`,
        borderRadius: 18,
        padding: 22,
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 800, color: THEME.textLight }}>{section.title}</h3>
      {section.subtext && (
        <p style={{ fontSize: 12.5, color: THEME.textMuted, marginTop: 2 }}>{section.subtext}</p>
      )}

      <div style={{ marginTop: 14 }}>
        {section.items.map(item => (
          <div
            key={`${section.id}-${item.name}-${item.price}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderTop: `1px solid ${THEME.borderLine}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {item.img && (
                <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  <SafeImage src={resolveAssetUrl(item.img)} alt={item.name} />
                </div>
              )}
              <span style={{ fontSize: 13.5, fontWeight: 600, color: THEME.textLight }}>
                {item.name}
                {item.tag && (
                  <span style={{ ...pillBadgeStyle(THEME.gold, '#120d04'), marginLeft: 6, fontSize: 9 }}>
                    {item.tag}
                  </span>
                )}
              </span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, color: THEME.gold }}>
              {formatPrice(item.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Customer Feedback Modal Dialog ─────────────────────────────────────────
function FeedbackModalDialog({
  onClose,
  productOptions,
  currentUserId,
}: {
  onClose: () => void
  productOptions: { id: number; name: string }[]
  currentUserId: number | null
}) {
  const [selectedStarRating, setSelectedStarRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    productOptions[0]?.id ?? null
  )
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const cleanedMessageText = feedbackComment.trim()
  const canSubmitFeedback =
    selectedProductId !== null &&
    selectedStarRating > 0 &&
    cleanedMessageText.length > 0 &&
    cleanedMessageText.length <= MAXIMUM_FEEDBACK_CHARACTERS

  const handleFeedbackSubmit = async () => {
    if (!canSubmitFeedback) return
    setSubmitStatus('sending')
    setErrorMessage('')

    try {
      await api.post('/feedback', {
        product_id: selectedProductId,
        customer_user_id: currentUserId,
        rating: selectedStarRating,
        comment: cleanedMessageText,
      })
      setSubmitStatus('done')
    } catch (networkError: any) {
      setErrorMessage(networkError?.message || 'Could not send feedback. Please try again.')
      setSubmitStatus('error')
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 900,
        }}
      />
      <div
        role="dialog"
        aria-label="Feedback Modal"
        style={{
          position: 'fixed',
          zIndex: 901,
          right: 20,
          bottom: 84,
          width: 'min(400px, calc(100vw - 36px))',
          backgroundColor: '#13110e',
          border: `1px solid ${THEME.borderLine}`,
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: THEME.textLight }}>Order Feedback</p>
            <p style={{ fontSize: 12, color: THEME.textMuted }}>Tell us how your food was.</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 0, color: THEME.textMuted, cursor: 'pointer', fontSize: 20 }}
          >
            ×
          </button>
        </div>

        {submitStatus === 'done' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontWeight: 800, fontSize: 16, color: THEME.gold }}>Thank you!</p>
            <p style={{ fontSize: 13, color: THEME.textMuted, marginTop: 4 }}>
              Your review helps us keep serving the crunchiest chicken.
            </p>
            <button onClick={onClose} style={{ ...ghostButtonStyle, marginTop: 16, width: '100%' }}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <p style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 6 }}>Rating</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(starNumber => (
                  <button
                    key={starNumber}
                    type="button"
                    onClick={() => setSelectedStarRating(starNumber)}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      borderRadius: 6,
                      border: `1px solid ${starNumber <= selectedStarRating ? THEME.gold : THEME.borderLine}`,
                      backgroundColor: starNumber <= selectedStarRating ? THEME.gold : 'transparent',
                      color: starNumber <= selectedStarRating ? '#120d04' : THEME.textLight,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {starNumber} ★
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 6 }}>Select Item</p>
              <select
                value={selectedProductId ?? ''}
                onChange={event => setSelectedProductId(Number(event.target.value) || null)}
                style={{
                  width: '100%',
                  font: 'inherit',
                  fontSize: 12.5,
                  color: THEME.textLight,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${THEME.borderLine}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  outline: 'none',
                }}
              >
                {productOptions.map(option => (
                  <option key={option.id} value={option.id} style={{ background: '#110f0d', color: '#fff' }}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 6 }}>Your Thoughts</p>
              <textarea
                rows={3}
                maxLength={MAXIMUM_FEEDBACK_CHARACTERS}
                value={feedbackComment}
                onChange={event => setFeedbackComment(event.target.value)}
                placeholder="What did you like or what can we improve?"
                style={{
                  width: '100%',
                  font: 'inherit',
                  fontSize: 13,
                  color: THEME.textLight,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${THEME.borderLine}`,
                  borderRadius: 8,
                  padding: 10,
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 11, textAlign: 'right', marginTop: 4, color: THEME.textMuted }}>
                {feedbackComment.length}/{MAXIMUM_FEEDBACK_CHARACTERS}
              </p>
            </div>

            {submitStatus === 'error' && (
              <p style={{ fontSize: 12, color: THEME.spicyRed }}>{errorMessage}</p>
            )}

            <button
              onClick={handleFeedbackSubmit}
              disabled={!canSubmitFeedback || submitStatus === 'sending'}
              style={{
                ...solidGoldButtonStyle,
                opacity: canSubmitFeedback ? 1 : 0.45,
                cursor: canSubmitFeedback ? 'pointer' : 'not-allowed',
                padding: '10px',
              }}
            >
              {submitStatus === 'sending' ? 'SUBMITTING…' : 'SUBMIT FEEDBACK'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main Products Page Component ───────────────────────────────────────────
export default function Products({ isAuthenticated = false, onLogout }: ProductsPageProps) {
  const navigate = useNavigate()
  const { isMobile, isTablet } = useScreenBreakpoints()
  const { user } = useAuth()

  // Real backend API states
  const [productsList, setProductsList] = useState<Product[]>([])
  const [flavorsList, setFlavorsList] = useState<Flavor[]>([])
  const [menuSectionsList, setMenuSectionsList] = useState<MenuSection[]>([])
  const [promosList, setPromosList] = useState<PromoOffer[]>([])

  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isLoadingFlavors, setIsLoadingFlavors] = useState(true)
  const [isLoadingMenuSections, setIsLoadingMenuSections] = useState(true)
  const [isLoadingPromos, setIsLoadingPromos] = useState(true)

  // Filter & Search states
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSpicyOnlyFilter, setIsSpicyOnlyFilter] = useState(false)
  const [activeSortOption, setActiveSortOption] = useState<SortOption>('featured')

  // Selected individual flavor index for the Flavor Spotlight
  const [selectedFlavorIndex, setSelectedFlavorIndex] = useState(0)

  // UI Interactive states
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [hasScrolledDown, setHasScrolledDown] = useState(false)
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false)

  const currentUserId = isAuthenticated && user && Number(user.userId) > 0 ? Number(user.userId) : null

  // Fetch restaurant general settings
  useEffect(() => {
    void fetchGeneralSettings()
  }, [])

  // Track window scroll for sticky navbar blur
  useEffect(() => {
    const handleScroll = () => setHasScrolledDown(window.scrollY > 12)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Operating hours check
  useEffect(() => {
    const checkOperatingHours = () => {
      const now = new Date()
      const currentDay = now.getDay()
      const currentHourDecimal = now.getHours() + now.getMinutes() / 60
      const isOpenWeekday = currentDay >= 1 && currentDay <= 5 && currentHourDecimal >= 10 && currentHourDecimal < 22
      const isOpenWeekend = (currentDay === 0 || currentDay === 6) && currentHourDecimal >= 11 && currentHourDecimal < 20.5
      setIsRestaurantOpen(isOpenWeekday || isOpenWeekend)
    }

    checkOperatingHours()
    const timerInterval = setInterval(checkOperatingHours, 60000)
    return () => clearInterval(timerInterval)
  }, [])

  // Fetch real data from backend endpoints
  useEffect(() => {
    let isRequestCancelled = false

    api
      .get<unknown[]>('/api/products?item_type=menu_item')
      .then(response => {
        if (!isRequestCancelled) {
          const validArray = Array.isArray(response) ? response : []
          setProductsList(mapApiProductsToApp(validArray))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isRequestCancelled) setIsLoadingProducts(false)
      })

    api
      .get<Flavor[]>('/api/flavors')
      .then(response => {
        if (!isRequestCancelled) {
          setFlavorsList(Array.isArray(response) ? response : [])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isRequestCancelled) setIsLoadingFlavors(false)
      })

    api
      .get<MenuSection[]>('/api/menu-sections')
      .then(response => {
        if (!isRequestCancelled) {
          setMenuSectionsList(Array.isArray(response) ? response : [])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isRequestCancelled) setIsLoadingMenuSections(false)
      })

    api
      .get<PromoOffer[]>('/api/promos')
      .then(response => {
        if (!isRequestCancelled) {
          setPromosList(Array.isArray(response) ? response : [])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isRequestCancelled) setIsLoadingPromos(false)
      })

    return () => {
      isRequestCancelled = true
    }
  }, [])

  // Filtered & Sorted products catalog
  const filteredProducts = useMemo(() => {
    let result = productsList.filter(product => {
      const matchCategory = activeCategory === 'All' || product.category === activeCategory
      const matchSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchSpicy = !isSpicyOnlyFilter || product.spicy
      return matchCategory && matchSearch && matchSpicy
    })

    if (activeSortOption === 'rating') result.sort((a, b) => b.rating - a.rating)
    else if (activeSortOption === 'price-asc') result.sort((a, b) => a.price - b.price)
    else if (activeSortOption === 'price-desc') result.sort((a, b) => b.price - a.price)

    return result
  }, [productsList, activeCategory, searchQuery, isSpicyOnlyFilter, activeSortOption])

  const feedbackProductOptions = useMemo(
    () => productsList.map(product => ({ id: product.id, name: product.name })),
    [productsList]
  )

  const heroSlidesList = useMemo(
    () => productsList.filter(product => product.img).slice(0, MAXIMUM_HERO_SLIDES),
    [productsList]
  )

  // Current selected individual flavor for the showcase
  const activeSpotlightFlavor = flavorsList[selectedFlavorIndex] ?? flavorsList[0]

  // Navigation handlers
  const handleOrderNavigate = useCallback(() => {
    navigate('/usersmenu?showOrderModal=true')
  }, [navigate])

  const handleLogoutAction = useCallback(() => {
    onLogout?.()
    navigate('/products')
  }, [onLogout, navigate])

  const handleHomeNavigate = useCallback(() => {
    setIsMobileMenuOpen(false)
    if (window.location.pathname === '/products') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/products')
    }
  }, [navigate])

  const navigationLinks = [
    { label: 'Home', action: handleHomeNavigate },
    { label: 'Menu', action: handleOrderNavigate },
    { label: 'About', action: () => navigate('/aboutthecrunch') },
  ]

  const pageContainerPadding = isMobile ? '0 16px' : isTablet ? '0 28px' : '0 40px'

  return (
    <MotionConfig reducedMotion="user">
      <div style={{ minHeight: '100vh', backgroundColor: THEME.background, color: THEME.textLight, position: 'relative' }}>
        
        {/* Soft Ambient Glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100vw',
            height: 520,
            background: 'radial-gradient(circle at 50% 0%, rgba(245,200,66,0.08), transparent 65%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* ── Fixed Navbar ────────────────────────────────────────────────── */}
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            height: NAVBAR_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: hasScrolledDown || isMobileMenuOpen ? 'rgba(9,8,7,0.94)' : 'transparent',
            backdropFilter: hasScrolledDown || isMobileMenuOpen ? 'blur(20px)' : 'none',
            borderBottom: hasScrolledDown ? `1px solid ${THEME.borderLine}` : '1px solid transparent',
            transition: 'background-color 0.25s, border-color 0.25s',
          }}
        >
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              padding: pageContainerPadding,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'none',
                border: 0,
                cursor: 'pointer',
                color: THEME.textLight,
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: '-0.02em',
              }}
            >
              <img src="/img/logo24.png" alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
              {!isMobile && (
                <span>
                  The <span style={{ color: THEME.gold }}>Crunch</span>
                </span>
              )}
            </button>

            {!isMobile && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={pillBadgeStyle(
                    isRestaurantOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    isRestaurantOpen ? THEME.successGreen : THEME.spicyRed,
                    isRestaurantOpen ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'
                  )}
                >
                  {isRestaurantOpen ? '● OPEN NOW' : '○ CLOSED'}
                </span>

                {navigationLinks.map(link => (
                  <button
                    key={link.label}
                    onClick={link.action}
                    style={{
                      background: 'none',
                      border: 0,
                      color: THEME.textMuted,
                      fontSize: 13.5,
                      fontWeight: 600,
                      padding: '8px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = THEME.textLight }}
                    onMouseLeave={e => { e.currentTarget.style.color = THEME.textMuted }}
                  >
                    {link.label}
                  </button>
                ))}

                <span style={{ width: 1, height: 16, backgroundColor: THEME.borderLine, margin: '0 4px' }} />

                {isAuthenticated ? (
                  <>
                    {user?.username && (
                      <span style={pillBadgeStyle('rgba(255,255,255,0.05)', THEME.textLight)}>
                        {user.username}
                      </span>
                    )}
                    <button onClick={handleLogoutAction} style={solidGoldButtonStyle}>
                      LOG OUT
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => navigate('/login')} style={ghostButtonStyle}>
                      LOG IN
                    </button>
                    <button onClick={() => navigate('/login?tab=signup')} style={solidGoldButtonStyle}>
                      SIGN UP
                    </button>
                  </>
                )}
              </nav>
            )}

            {isMobile && (
              <button
                onClick={() => setIsMobileMenuOpen(previous => !previous)}
                style={{ ...ghostButtonStyle, padding: '6px 12px', fontSize: 11 }}
              >
                {isMobileMenuOpen ? 'CLOSE' : 'MENU'}
              </button>
            )}
          </div>

          {/* Mobile Drawer Menu */}
          <AnimatePresence>
            {isMobile && isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  position: 'absolute',
                  top: NAVBAR_HEIGHT,
                  left: 0,
                  right: 0,
                  backgroundColor: 'rgba(9,8,7,0.98)',
                  borderBottom: `1px solid ${THEME.borderLine}`,
                  padding: '16px 20px 24px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    ...pillBadgeStyle(
                      isRestaurantOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      isRestaurantOpen ? THEME.successGreen : THEME.spicyRed
                    ),
                    justifySelf: 'flex-start',
                    marginBottom: 6,
                  }}
                >
                  {isRestaurantOpen ? '● OPEN NOW' : '○ CLOSED'}
                </span>

                {navigationLinks.map(link => (
                  <button
                    key={link.label}
                    onClick={() => {
                      link.action()
                      setIsMobileMenuOpen(false)
                    }}
                    style={{
                      textAlign: 'left',
                      background: 'none',
                      border: 0,
                      color: THEME.textLight,
                      fontSize: 16,
                      fontWeight: 700,
                      padding: '10px 0',
                      borderBottom: `1px solid ${THEME.borderLine}`,
                    }}
                  >
                    {link.label}
                  </button>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {isAuthenticated ? (
                    <button
                      onClick={() => {
                        handleLogoutAction()
                        setIsMobileMenuOpen(false)
                      }}
                      style={{ ...solidGoldButtonStyle, flex: 1 }}
                    >
                      LOG OUT
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          navigate('/login')
                          setIsMobileMenuOpen(false)
                        }}
                        style={{ ...ghostButtonStyle, flex: 1 }}
                      >
                        LOG IN
                      </button>
                      <button
                        onClick={() => {
                          navigate('/login?tab=signup')
                          setIsMobileMenuOpen(false)
                        }}
                        style={{ ...solidGoldButtonStyle, flex: 1 }}
                      >
                        SIGN UP
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* ── Hero Section ────────────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: `calc(${NAVBAR_HEIGHT}px + ${isMobile ? '24px' : '48px'})`,
            paddingBottom: isMobile ? 32 : 56,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              padding: pageContainerPadding,
              display: 'grid',
              gridTemplateColumns: isTablet ? '1fr' : '1.05fr 0.95fr',
              gap: isMobile ? 28 : 50,
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ ...pillBadgeStyle('rgba(255,255,255,0.05)', THEME.textMuted), marginBottom: 14 }}>
                Fairview Flagship • Hot & Crispy
              </span>
              <h1
                style={{
                  fontSize: isMobile ? 40 : 64,
                  fontWeight: 800,
                  letterSpacing: '-0.035em',
                  lineHeight: 1.02,
                  margin: '12px 0',
                  color: THEME.textLight,
                }}
              >
                Signature Chicken, <br />
                <span style={{ color: THEME.gold, fontStyle: 'italic' }}>Fried to Gold.</span>
              </h1>
              <p
                style={{
                  color: THEME.textMuted,
                  fontSize: 15,
                  lineHeight: 1.6,
                  maxWidth: 440,
                  marginTop: 14,
                }}
              >
                Fresh, premium boneless chicken hand-tossed in signature house glazes. Cooked to order for dine-in, takeout, or delivery.
              </p>

              <div style={{ marginTop: 24, maxWidth: 420 }}>
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search chicken, rice bowls, combos…"
                  style={{
                    width: '100%',
                    font: 'inherit',
                    fontSize: 13.5,
                    color: THEME.textLight,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${THEME.borderLine}`,
                    borderRadius: 10,
                    padding: '12px 16px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              {isLoadingProducts ? (
                <div style={{ aspectRatio: '4/3', width: '100%', borderRadius: 22, backgroundColor: '#161310' }} />
              ) : (
                <HeroSlideshow slides={heroSlidesList} onOrderClick={handleOrderNavigate} />
              )}
            </div>
          </div>
        </section>

        {/* ── Sticky Category & Filter Toolbar ────────────────────────────── */}
        <div
          style={{
            position: 'sticky',
            top: NAVBAR_HEIGHT,
            zIndex: 40,
            backgroundColor: 'rgba(9,8,7,0.92)',
            backdropFilter: 'blur(18px)',
            borderBottom: `1px solid ${THEME.borderLine}`,
            padding: '12px 0',
          }}
        >
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              padding: pageContainerPadding,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
              {MENU_CATEGORIES.map(categoryItem => {
                const isActive = activeCategory === categoryItem
                const itemsCount =
                  categoryItem === 'All'
                    ? productsList.length
                    : productsList.filter(p => p.category === categoryItem).length

                return (
                  <button
                    key={categoryItem}
                    onClick={() => setActiveCategory(categoryItem)}
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'none',
                      border: 0,
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: isActive ? THEME.textLight : THEME.textMuted,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                  >
                    {categoryItem} ({itemsCount})
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setIsSpicyOnlyFilter(previous => !previous)}
                style={{
                  ...(isSpicyOnlyFilter ? solidGoldButtonStyle : ghostButtonStyle),
                  padding: '6px 12px',
                  fontSize: 11,
                }}
              >
                {isSpicyOnlyFilter ? 'SPICY: ON' : 'SPICY ONLY'}
              </button>

              <select
                value={activeSortOption}
                onChange={event => setActiveSortOption(event.target.value as SortOption)}
                style={{
                  font: 'inherit',
                  fontSize: 12.5,
                  color: THEME.textMuted,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${THEME.borderLine}`,
                  borderRadius: 8,
                  padding: '7px 10px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="featured" style={{ background: '#110f0d', color: '#fff' }}>Featured</option>
                <option value="rating" style={{ background: '#110f0d', color: '#fff' }}>Top Rated</option>
                <option value="price-asc" style={{ background: '#110f0d', color: '#fff' }}>Price: Low to High</option>
                <option value="price-desc" style={{ background: '#110f0d', color: '#fff' }}>Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Main Products Grid ──────────────────────────────────────────── */}
        <main style={{ maxWidth: 1240, margin: '0 auto', padding: `${isMobile ? '28px' : '40px'} ${isMobile ? '16px' : isTablet ? '28px' : '40px'} 90px` }}>
          {isLoadingProducts ? (
            <div style={responsiveGridStyle(isMobile)}>
              {Array.from({ length: 6 }).map((_, placeholderIndex) => (
                <div key={placeholderIndex} style={{ height: 340, borderRadius: 18, backgroundColor: '#15120e' }} />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '70px 20px',
                backgroundColor: THEME.cardBackground,
                borderRadius: 20,
                border: `1px solid ${THEME.borderLine}`,
              }}
            >
              <p style={{ fontSize: 18, fontWeight: 800 }}>No items match your criteria</p>
              <p style={{ color: THEME.textMuted, fontSize: 13.5, marginTop: 4 }}>
                Try clearing your search or switching categories.
              </p>
              {(searchQuery || isSpicyOnlyFilter || activeCategory !== 'All') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setIsSpicyOnlyFilter(false)
                    setActiveCategory('All')
                  }}
                  style={{ ...ghostButtonStyle, marginTop: 16 }}
                >
                  RESET FILTERS
                </button>
              )}
            </div>
          ) : (
            <>
              <p
                style={{
                  fontSize: 12.5,
                  color: THEME.textMuted,
                  marginBottom: 16,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'}
              </p>
              <div style={responsiveGridStyle(isMobile)}>
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOrderClick={handleOrderNavigate}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Deals and Promos Section ─────────────────────────────────── */}
          {(isLoadingPromos || promosList.length > 0) && (
            <section style={{ marginTop: 80 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Current Offers
              </h2>
              <p style={{ color: THEME.textMuted, fontSize: 13.5, marginBottom: 24 }}>
                Limited-time combos and seasonal discounts.
              </p>

              {isLoadingPromos ? (
                <div style={responsiveGridStyle(isMobile)}>
                  {Array.from({ length: 3 }).map((_, placeholderIndex) => (
                    <div key={placeholderIndex} style={{ height: 260, borderRadius: 18, backgroundColor: '#15120e' }} />
                  ))}
                </div>
              ) : (
                <div style={responsiveGridStyle(isMobile)}>
                  {promosList.map(promo => (
                    <PromoCard key={promo.id} promo={promo} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Individual Signature Flavor Spotlight ────────────────────── */}
          {(isLoadingFlavors || flavorsList.length > 0) && (
            <section style={{ marginTop: 80 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Signature Flavors
              </h2>
              <p style={{ color: THEME.textMuted, fontSize: 13.5, marginBottom: 20 }}>
                Available on every wing, strip, and boneless chicken order. Select a flavor to preview.
              </p>

              {/* Individual Flavor Selector Tabs */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {flavorsList.map((flavor, index) => {
                  const isSelected = selectedFlavorIndex === index
                  return (
                    <button
                      key={flavor.name}
                      onClick={() => setSelectedFlavorIndex(index)}
                      style={{
                        background: isSelected ? THEME.gold : 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? '#120d04' : THEME.textLight,
                        border: `1px solid ${isSelected ? THEME.gold : THEME.borderLine}`,
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {flavor.name}
                    </button>
                  )
                })}
              </div>

              {/* Individual Selected Flavor Preview Card */}
              {activeSpotlightFlavor && (
                <div
                  style={{
                    backgroundColor: THEME.cardBackground,
                    border: `1px solid ${THEME.borderLine}`,
                    borderRadius: 20,
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: isMobile ? 16 : 28,
                    alignItems: 'center',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: isMobile ? '16/10' : '4/3', backgroundColor: '#151310' }}>
                    <SafeImage
                      src={activeSpotlightFlavor.img ? resolveAssetUrl(activeSpotlightFlavor.img) : ''}
                      alt={activeSpotlightFlavor.name}
                    />
                  </div>
                  <div style={{ padding: isMobile ? '0 20px 20px' : '24px 28px 24px 0' }}>
                    <span style={{ ...pillBadgeStyle(THEME.gold, '#120d04'), marginBottom: 10 }}>
                      HOUSE FLAVOR
                    </span>
                    <h3 style={{ fontSize: 24, fontWeight: 800, color: THEME.textLight, marginTop: 8, marginBottom: 10 }}>
                      {activeSpotlightFlavor.name}
                    </h3>
                    <p style={{ fontSize: 14, color: THEME.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
                      {activeSpotlightFlavor.desc || 'Hand-tossed with our signature glaze, cooked fresh to order.'}
                    </p>
                    <button onClick={handleOrderNavigate} style={solidGoldButtonStyle}>
                      ORDER WITH THIS FLAVOR
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Full Menu Board Section ───────────────────────────────────── */}
          {(isLoadingMenuSections || menuSectionsList.length > 0) && (
            <section style={{ marginTop: 80 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Full Store Menu
              </h2>
              <p style={{ color: THEME.textMuted, fontSize: 13.5, marginBottom: 24 }}>
                Complete catalog categorized by section.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))',
                  gap: 20,
                }}
              >
                {isLoadingMenuSections
                  ? Array.from({ length: 4 }).map((_, placeholderIndex) => (
                      <div key={placeholderIndex} style={{ height: 240, borderRadius: 18, backgroundColor: '#15120e' }} />
                    ))
                  : menuSectionsList.map(section => (
                      <MenuBoardSection key={section.id} section={section} />
                    ))}
              </div>
            </section>
          )}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${THEME.borderLine}`, backgroundColor: '#060504', padding: '50px 0 28px' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: pageContainerPadding }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 36,
              }}
            >
              <div>
                <p style={{ fontWeight: 800, fontSize: 17, color: THEME.textLight }}>
                  The <span style={{ color: THEME.gold }}>Crunch</span>
                </p>
                <p style={{ marginTop: 6, fontSize: 13, color: THEME.textMuted, lineHeight: 1.6 }}>
                  6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines
                </p>
                <a
                  href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...ghostButtonStyle, marginTop: 12, fontSize: 11, padding: '6px 12px' }}
                >
                  GOOGLE MAPS
                </a>
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: THEME.textMuted }}>
                  Store Hours
                </p>
                <div style={{ marginTop: 8, fontSize: 13, color: THEME.textMuted, lineHeight: 1.6 }}>
                  <p>Mon–Fri: 10:00 AM – 10:00 PM</p>
                  <p>Sat–Sun: 11:00 AM – 8:30 PM</p>
                </div>
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: THEME.textMuted }}>
                  Social
                </p>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <a
                    href="https://www.instagram.com/thecrunchfairview"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: THEME.textMuted, textDecoration: 'none', fontSize: 13 }}
                  >
                    Instagram
                  </a>
                  <a
                    href="https://www.facebook.com/thecrunchfairview"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: THEME.textMuted, textDecoration: 'none', fontSize: 13 }}
                  >
                    Facebook
                  </a>
                </div>
              </div>
            </div>

            <p
              style={{
                marginTop: 40,
                paddingTop: 20,
                borderTop: `1px solid ${THEME.borderLine}`,
                fontSize: 11.5,
                color: THEME.textMuted,
                textAlign: 'center',
              }}
            >
              © {new Date().getFullYear()} The Crunch Fairview. All rights reserved.
            </p>
          </div>
        </footer>

        {/* ── Feedback Modal Dialog ────────────────────────────────────────── */}
        <AnimatePresence>
          {isFeedbackModalOpen && (
            <FeedbackModalDialog
              onClose={() => setIsFeedbackModalOpen(false)}
              productOptions={feedbackProductOptions}
              currentUserId={currentUserId}
            />
          )}
        </AnimatePresence>

        {/* ── Floating Action Feedback Button ──────────────────────────────── */}
        <button
          onClick={() => setIsFeedbackModalOpen(previous => !previous)}
          style={{
            ...solidGoldButtonStyle,
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 80,
            borderRadius: 999,
            padding: '11px 20px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {isFeedbackModalOpen ? 'CLOSE' : 'FEEDBACK'}
        </button>
      </div>
    </MotionConfig>
  )
}

// ── Shared Inline Style Generators ─────────────────────────────────────────
function pillBadgeStyle(
  backgroundColor: string,
  textColor: string,
  borderColor: string = 'transparent'
): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 6,
    backgroundColor,
    color: textColor,
    border: `1px solid ${borderColor}`,
  }
}

function slideArrowButtonStyle(position: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [position]: 14,
    zIndex: 3,
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(9, 8, 7, 0.6)',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
  }
}

function responsiveGridStyle(isMobile: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
  }
}

const solidGoldButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: 10,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
  backgroundColor: THEME.gold,
  color: '#120d04',
  cursor: 'pointer',
  textDecoration: 'none',
}

const ghostButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${THEME.borderLine}`,
  borderRadius: 10,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  color: THEME.textLight,
  cursor: 'pointer',
  textDecoration: 'none',
}