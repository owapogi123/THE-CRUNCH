import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, Award, Utensils } from 'lucide-react';

export default function TheCrunch() {
  const [activeMenu, setActiveMenu] = useState('main');
  const [cartCount, setCartCount] = useState(0);
  const navigate = useNavigate();
  const [isSignedIn, setIsSignedIn] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  // Get current day
  const getCurrentDay = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    return days[today.getDay()];
  };

  const handleAddToCart = () => {
    setCartCount(prev => prev + 1);
  };

  const handleSubscribe = () => {
    alert('Thank you for subscribing to The Crunch!');
  };

  const handleSignIn = () => {
    if (!isSignedIn) {
      navigate('/login');
      return;
    }

    // Sign out
    localStorage.removeItem('isAuthenticated');
    setIsSignedIn(false);
    navigate('/');
  };

  // Add product form state & submit
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ product_name: '', price: '', stock: '', promo: '' });
  const [addStatus, setAddStatus] = useState<string | null>(null);

  const submitNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStatus('Adding...');
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newProduct.product_name,
          price: parseFloat(newProduct.price) || 0,
          stock: parseInt(newProduct.stock || '0', 10) || 0,
          promo: newProduct.promo || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddStatus('Product added');
        setNewProduct({ product_name: '', price: '', stock: '', promo: '' });
      } else {
        setAddStatus(`Error: ${data.message || data.error || res.statusText}`);
      }
    } catch (err: any) {
      setAddStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setAddStatus(null), 3000);
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            
            <span className="text-2xl font-bold text-gray-800">The Crunch Fairview</span>
          </div>
          <nav className="flex items-center gap-8">
            <a href="#about" className="text-gray-600 hover:text-gray-900 transition">About</a>
            <a href="#foods" className="text-gray-600 hover:text-gray-900 transition">Foods</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition">Pricing</a>
            <button 
              onClick={handleSignIn}
              className="px-6 py-2 border-2 border-orange-400 text-orange-400 rounded-full hover:bg-orange-50 transition shadow-md"
            >
              {isSignedIn ? 'Sign out' : 'Sign in'}
            </button>
            <button 
              onClick={handleAddToCart}
              className="relative w-10 h-10 bg-orange-400 text-white rounded-lg flex items-center justify-center hover:bg-orange-500 transition shadow-lg"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-12 gap-8">
        <div className="col-span-8 space-y-16">
          <section className="relative">
            <div className="absolute -left-20 -top-20 w-64 h-64 opacity-20">
              <div className="w-full h-full bg-gradient-to-br from-green-300 to-green-400 rounded-full blur-3xl"></div>
            </div>
            
            <div className="grid grid-cols-2 gap-12 items-center">
              <div className="space-y-6 relative z-10">
                <p className="text-sm text-gray-400 tracking-wider uppercase font-medium">  </p>
                <h1 className="text-6xl font-bold leading-tight">
                  <span className="text-gray-800">It's The Crunch Time</span>
                  <br />
                  <span className="text-orange-400">Built for the Bite</span>
                </h1>
                <p className="text-gray-500 leading-relaxed">
                 Our Chicken Doesn't Just Taste Good It Sounds Good.
                </p>
                <button 
                  onClick={handleSubscribe}
                  className="px-8 py-3 bg-orange-400 text-white rounded-full hover:bg-orange-500 transition shadow-lg hover:shadow-xl"
                >
                  Subscribe
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl"></div>
                <div className="relative p-8">
                  <div className="bg-gradient-to-br from-orange-50 to-white rounded-full p-4 shadow-2xl">
                    <img 
                      src="https://i.pinimg.com/1200x/39/e3/a1/39e3a139642e134c23833f4b61f05ab7.jpg" 
                      alt="Pasta dish"
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                  <div className="absolute -top-4 left-8 w-16 h-16 rounded-full shadow-xl" style={{ backgroundColor: '#8f7c64' }}></div>
                  <div className="absolute top-1/4 -left-4 w-12 h-12 rounded-full shadow-xl" style={{ backgroundColor: '#7d5f3b' }}></div>
                  <div className="absolute bottom-8 -right-4 w-12 h-12 rounded-lg shadow-xl" style={{ backgroundColor: '#917a5e' }}></div>
                  <div className="absolute -bottom-4 left-1/4 w-10 h-10 rounded-full shadow-xl" style={{ backgroundColor: '#473f36' }}></div>
                </div>
              </div>
            </div>
          </section>
          <section className="space-y-8">
            <div>
              <p className="text-sm text-gray-400 tracking-wider uppercase mb-2 font-medium">Commitment</p>
              <h2 className="text-4xl font-bold text-gray-800">Why we are good for you</h2>
              <p className="text-gray-500 mt-2">A Symmetry of Juice and Jest: The Ultimate Crunch.</p>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-8">
              <div className="text-center space-y-4 bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition">
                <div className="w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">Top Rated</h3>
                <p className="text-gray-500 text-sm">Simply the Best Fried Chicken You’ll Find Locally.</p>
              </div>

              <div className="text-center space-y-4 bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition">
                <div className="w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Utensils className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">Fresh Food</h3>
                <p className="text-gray-500 text-sm">The Peak of Seasonal Freshness.</p>
              </div>
            </div>
          </section>
          <section className="relative rounded-3xl overflow-hidden h-64 bg-gray-100 shadow-xl">
            <img 
              src="https://i.pinimg.com/736x/68/6f/aa/686faa8c5c7db2072032ef77669f9103.jpg" 
              alt="Tea and plate"
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 to-transparent flex items-center">
              <div className="px-12 space-y-4">
                <p className="text-sm text-gray-400 tracking-wider uppercase font-medium">Subscribe</p>
                <h3 className="text-4xl font-bold text-gray-800">Perfect Solutions<br />For Your Foods</h3>
                <p className="text-gray-800 text-sm">Top-Rated Local Chicken: Always fresh, never frozen, and fried to perfection." or "Crispy Chicken paired with the area's freshest seasonal sides.</p>
                <button 
                  onClick={handleSubscribe}
                  className="px-8 py-3 bg-orange-400 text-white rounded-full hover:bg-orange-500 transition shadow-lg hover:shadow-xl"
                >
                  Subscribe
                </button>
              </div>
            </div>
          </section>
        </div>
        <div className="col-span-4 space-y-8">
          <div className="bg-white rounded-3xl p-8 shadow-xl">
            <h3 className="text-3xl font-bold text-gray-800 mb-2">Menus for today</h3>
            <p className="text-gray-400 text-sm mb-8">Ultra-crispy, jagged edges that hold "crunch" for longer than a standard nugget..</p>
            
            <div className="rounded-2xl overflow-hidden mb-6 shadow-lg">
              <img 
                src="https://i.pinimg.com/736x/84/df/b5/84dfb5732aa30595aeac6d2b9b43d23f.jpg" 
                alt="Breakfast"
                className="w-full h-48 object-cover"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Breakfast {getCurrentDay()}</h4>
                <p className="text-gray-400 text-sm">One bite is all the proof you need. Taste the crunch today.</p>
              </div>

              <button
                onClick={() => setActiveMenu('main')}
                className={`w-full flex items-center justify-between pb-4 border-b transition hover:bg-orange-50 px-4 py-2 rounded-lg ${activeMenu === 'main' ? 'bg-orange-50' : ''}`}
              >
                <span className="text-gray-800 font-semibold">Main Course</span>
                <div className="w-10 h-10 bg-orange-400 rounded-full flex items-center justify-center shadow-md">
                  <Utensils className="w-5 h-5 text-white" />
                </div>
              </button>

              <button
                onClick={() => setActiveMenu('dessert')}
                className={`w-full flex items-center justify-between pb-4 border-b transition hover:bg-orange-50 px-4 py-2 rounded-lg ${activeMenu === 'dessert' ? 'bg-orange-50' : ''}`}
              >
                <span className="text-gray-800 font-semibold">Dessert</span>
                <div className="w-10 h-10 bg-orange-400 rounded-full flex items-center justify-center shadow-md">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
              </button>

              <button
                onClick={() => setActiveMenu('appetizer')}
                className={`w-full flex items-center justify-between transition hover:bg-orange-50 px-4 py-2 rounded-lg ${activeMenu === 'appetizer' ? 'bg-orange-50' : ''}`}
              >
                <span className="text-gray-800 font-semibold">Appetizer</span>
                <div className="w-10 h-10 bg-orange-400 rounded-full flex items-center justify-center shadow-md">
                  <Award className="w-5 h-5 text-white" />
                </div>
              </button>
            </div>
            {/* Admin add product panel */}
            {isSignedIn && (
              <div className="mt-6 p-4 bg-white rounded-2xl shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">Admin: Add Product</h4>
                  <button onClick={() => setShowAddForm(s => !s)} className="text-sm text-orange-500">{showAddForm ? 'Close' : 'Add'}</button>
                </div>
                {showAddForm && (
                  <form onSubmit={submitNewProduct} className="space-y-3">
                    <input required value={newProduct.product_name} onChange={e => setNewProduct({...newProduct, product_name: e.target.value})} placeholder="Product name" className="w-full input px-3 py-2 border rounded-md" />
                    <input value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} placeholder="Price" className="w-full input px-3 py-2 border rounded-md" />
                    <input value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} placeholder="Stock" className="w-full input px-3 py-2 border rounded-md" />
                    <input value={newProduct.promo} onChange={e => setNewProduct({...newProduct, promo: e.target.value})} placeholder="Promo (optional)" className="w-full input px-3 py-2 border rounded-md" />
                    <div className="flex items-center gap-2">
                      <button type="submit" className="px-4 py-2 bg-orange-400 text-white rounded-md">Save</button>
                      {addStatus && <span className="text-sm text-gray-600">{addStatus}</span>}
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-6 justify-end">
              <div className="w-8 h-8 bg-orange-100 rounded-full shadow-sm"></div>
              <div className="w-8 h-8 bg-orange-400 rounded-full shadow-md"></div>
            </div>
          </div>
        </div>
      </div>
      <footer className="bg-white border-t mt-12 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <a href="#" className="w-8 h-8 border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition shadow-sm">
                G
              </a>
              <a href="#" className="w-8 h-8 border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition shadow-sm">
                in
              </a>
            </div>
            
            <div className="flex gap-16 text-sm">
              <div>
                <h5 className="font-semibold text-gray-800 mb-2">Foods</h5>
                <ul className="space-y-1 text-gray-500">
                  <li><a href="#" className="hover:text-gray-800 transition">Pricing</a></li>
                  <li><a href="#" className="hover:text-gray-800 transition">Menu</a></li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold text-gray-800 mb-2">Help</h5>
                <ul className="space-y-1 text-gray-500">
                  <li><a href="#" className="hover:text-gray-800 transition">About</a></li>
                </ul>
              </div>
            </div>

            <p className="text-gray-400 text-sm">© 2024 All rights reserved</p>
            <a href="#" className="text-gray-500 text-sm hover:text-gray-700 transition">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}