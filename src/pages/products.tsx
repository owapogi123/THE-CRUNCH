import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, Award, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from "react-router-dom"

export default function TheCrunch() {
  const [activeMenu, setActiveMenu] = useState('main');
  const [cartCount, setCartCount] = useState(0);
  const [isSignedIn, setIsSignedIn] = useState(false); // retained for styling but not used

  // products fetched from backend
  const [productList, setProductList] = useState<any[]>([]);

  const getCurrentDay = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  const handleAddToCart = () => setCartCount(prev => prev + 1);
  const handleSubscribe = () => alert('Thank you for subscribing to The Crunch!');

  const navigate = useNavigate();
  const handleSignIn = () => {
    navigate('/login');
  };

  // load products when component mounts
  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then(setProductList)
      .catch(console.error);
  }, []);

  // wrap JSX in return; the link tag stays inside fragment
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      
      <motion.header
        className="bg-white shadow-md"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-800">The Crunch Fairview</span>
          </div>
          <nav className="flex items-center gap-8">
           <Link to="/aboutthecrunch" className="text-gray-600 hover:text-gray-900 transition">About</Link>
            <Link to="/usersmenu" className="text-gray-600 hover:text-gray-900 transition">Menu</Link>
            <motion.button 
              onClick={handleSignIn}
              className="px-6 py-2 border-2 border-orange-400 text-orange-400 rounded-full hover:bg-orange-50 transition shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Sign in
            </motion.button>

            <motion.button
              onClick={handleAddToCart}
              className="relative w-10 h-10 bg-orange-400 text-white rounded-lg flex items-center justify-center hover:bg-orange-500 transition shadow-lg"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ShoppingBag className="w-5 h-5" />
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.span
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </nav>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-12 gap-8">
        <div className="col-span-8 space-y-16">
          <section className="relative">
            <motion.div
              className="absolute -left-20 -top-20 w-64 h-64 opacity-20"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <div className="w-full h-full bg-gradient-to-br from-green-300 to-green-400 rounded-full blur-3xl"></div>
            </motion.div>

            <div className="grid grid-cols-2 gap-12 items-center">
              <motion.div
                className="space-y-6 relative z-10"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-6xl font-bold leading-tight">
                  <span className="text-gray-800">It's The Crunch Time</span>
                  <br />
                  <span className="text-orange-400">Once you go crunch, you'll crave for more bunch!</span>
                </h1>
                <p className="text-gray-500 leading-relaxed">
                  One of the Leading Boneless Fried Chicken Brands in the Philippines Serving Deliciousness at 200+ Branches Nationwide!
                </p>
                <motion.button
                  onClick={handleSubscribe}
                  className="px-8 py-3 bg-orange-400 text-white rounded-full hover:bg-orange-500 transition shadow-lg hover:shadow-xl"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Subscribe
                </motion.button>
              </motion.div>

              <motion.div
                className="relative"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl"></div>
                <div className="relative p-8">
                  <motion.div
                    className="bg-gradient-to-br from-orange-50 to-white rounded-full p-4 shadow-2xl"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    transition={{ duration: 0.3 }}
                  >
                    <img
                      src="https://i.pinimg.com/1200x/39/e3/a1/39e3a139642e134c23833f4b61f05ab7.jpg"
                      alt="Pasta dish"
                      className="w-full h-full object-cover rounded-full"
                    />
                  </motion.div>
                  <motion.div className="absolute -top-4 left-8 w-16 h-16 rounded-full shadow-xl" style={{ backgroundColor: '#8f7c64' }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
                  <motion.div className="absolute top-1/4 -left-4 w-12 h-12 rounded-full shadow-xl" style={{ backgroundColor: '#7d5f3b' }} animate={{ x: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
                  <motion.div className="absolute bottom-8 -right-4 w-12 h-12 rounded-lg shadow-xl" style={{ backgroundColor: '#917a5e' }} animate={{ rotate: [0, 10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
                  <motion.div className="absolute -bottom-4 left-1/4 w-10 h-10 rounded-full shadow-xl" style={{ backgroundColor: '#473f36' }} animate={{ y: [0, 10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }} />
                </div>
              </motion.div>
            </div>
          </section>

          <motion.section
            className="space-y-8"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <div>
              <p className="text-sm text-gray-400 tracking-wider uppercase mb-2 font-medium">Commitment</p>
              <h2 className="text-4xl font-bold text-gray-800">Why we are good for you</h2>
              <p className="text-gray-500 mt-2">A Symmetry of Juice and Jest: The Ultimate Crunch.</p>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-8">
              <motion.div className="text-center space-y-4 bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition" whileHover={{ y: -10 }} transition={{ duration: 0.3 }}>
                <motion.div className="w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center mx-auto shadow-md" whileHover={{ rotate: 360 }} transition={{ duration: 0.5 }}>
                  <Award className="w-8 h-8 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold text-gray-800">Top Rated</h3>
                <p className="text-gray-500 text-sm">Simply the Best Fried Chicken You'll Find Locally.</p>
              </motion.div>

              <motion.div className="text-center space-y-4 bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition" whileHover={{ y: -10 }} transition={{ duration: 0.3 }}>
                <motion.div className="w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center mx-auto shadow-md" whileHover={{ rotate: 360 }} transition={{ duration: 0.5 }}>
                  <Utensils className="w-8 h-8 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold text-gray-800">Fresh Food</h3>
                <p className="text-gray-500 text-sm">The Peak of Seasonal Freshness.</p>
              </motion.div>
            </div>
          </motion.section>

          <motion.section
            className="relative rounded-3xl overflow-hidden h-64 bg-gray-100 shadow-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            whileHover={{ scale: 1.02 }}
          >
            <img src="https://i.pinimg.com/736x/68/6f/aa/686faa8c5c7db2072032ef77669f9103.jpg" alt="Tea and plate" className="w-full h-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 to-transparent flex items-center">
              <div className="px-12 space-y-4">
                <p className="text-sm text-gray-400 tracking-wider uppercase font-medium">Subscribe</p>
                <h3 className="text-4xl font-bold text-gray-800">Perfect Solutions<br />For Your Foods</h3>
                <p className="text-gray-800 text-sm">Top-Rated Local Chicken: Always fresh, never frozen, and fried to perfection.</p>
                <motion.button onClick={handleSubscribe} className="px-8 py-3 bg-orange-400 text-white rounded-full hover:bg-orange-500 transition shadow-lg hover:shadow-xl" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  Subscribe
                </motion.button>
              </div>
            </div>
          </motion.section>
        </div>

        <motion.div
          className="col-span-4 space-y-8"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <motion.div className="bg-white rounded-3xl p-8 shadow-xl" whileHover={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <h3 className="text-3xl font-bold text-gray-800 mb-2">Menus for today</h3>
            <p className="text-gray-400 text-sm mb-8">Ultra-crispy, jagged edges that hold "crunch" for longer than a standard nugget.</p>
            {/* display simple list from backend */}
            {productList.length > 0 ? (
              <ul className="space-y-2">
                {productList.map((p) => (
                  <li key={p.id} className="text-gray-700">
                    {p.name} – ₱{p.price}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">(no products yet)</p>
            )}

            <motion.div className="rounded-2xl overflow-hidden mb-6 shadow-lg" whileHover={{ scale: 1.05 }} transition={{ duration: 0.3 }}>
              <img src="https://i.pinimg.com/736x/84/df/b5/84dfb5732aa30595aeac6d2b9b43d23f.jpg" alt="Breakfast" className="w-full h-48 object-cover" />
            </motion.div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Breakfast {getCurrentDay()}</h4>
                <p className="text-gray-400 text-sm">One bite is all the proof you need. Taste the crunch today.</p>
              </div>

              {[
                { key: 'main', label: 'Main Course', icon: <Utensils className="w-5 h-5 text-white" /> },
                { key: 'dessert', label: 'Dessert', icon: <ShoppingBag className="w-5 h-5 text-white" /> },
                { key: 'appetizer', label: 'Appetizer', icon: <Award className="w-5 h-5 text-white" /> },
              ].map(({ key, label, icon }, i) => (
                <motion.button
                  key={key}
                  onClick={() => setActiveMenu(key)}
                  className={`w-full flex items-center justify-between ${i < 2 ? 'pb-4 border-b' : ''} transition hover:bg-orange-50 px-4 py-2 rounded-lg ${activeMenu === key ? 'bg-orange-50' : ''}`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-gray-800 font-semibold">{label}</span>
                  <motion.div className="w-10 h-10 bg-orange-400 rounded-full flex items-center justify-center shadow-md" whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}>
                    {icon}
                  </motion.div>
                </motion.button>
              ))}
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <div className="w-8 h-8 bg-orange-100 rounded-full shadow-sm"></div>
              <div className="w-8 h-8 bg-orange-400 rounded-full shadow-md"></div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <motion.footer
        className="bg-white border-t mt-12 shadow-lg"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 5, delay: 0.1 }}
      >
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <motion.a href="#" className="w-8 h-8 border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition shadow-sm" whileHover={{ scale: 1.2, rotate: 5 }}>IG</motion.a>
              <motion.a href="#" className="w-8 h-8 border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition shadow-sm" whileHover={{ scale: 1.2, rotate: 5 }}>FB</motion.a>
            </div>
            <div className="flex gap-16 text-sm">
              <div>
                <h5 className="font-semibold text-gray-800 mb-2">Foods</h5>
                <ul className="space-y-1 text-gray-500">
                 <li><motion.a href="#" className="hover:text-gray-800 transition" whileHover={{ x: 5 }}>Menu</motion.a></li> 
                </ul>
              </div>
              <div>
                <h5 className="font-semibold text-gray-800 mb-2">Help</h5>
                <ul className="space-y-1 text-gray-500">
                  <li><motion.a href="#" className="hover:text-gray-800 transition" whileHover={{ x: 5 }}>About</motion.a></li>
                </ul>
              </div>
            </div>
            <p className="text-gray-400 text-sm">© 2024 All rights reserved</p>
            <motion.a href="#" className="text-gray-500 text-sm hover:text-gray-700 transition" whileHover={{ scale: 1.05 }}>Privacy Policy</motion.a>
          </div>
        </div>
      </motion.footer>
    </>
  );
}