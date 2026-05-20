'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, ShoppingBag, MapPin, Star, Clock, 
    ChevronRight, ArrowLeft, ShoppingCart, Plus, Minus, X, CreditCard 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Shop {
    id: string;
    owner_id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    delivery_radius_km: number;
    is_open: boolean;
    rating_avg: number;
    commission_pct: number;
    distance?: string;
}

interface Product {
    id: string;
    shop_id: string;
    name: string;
    description: string;
    price: number;
    stock_qty: number;
    image_url: string;
    is_available: boolean;
}

interface CartItem {
    product: Product;
    quantity: number;
}

export default function CustomerDashboard() {
    const router = useRouter();
    const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Location State (defaults to downtown San Francisco)
    const [userLat, setUserLat] = useState(37.7749);
    const [userLng, setUserLng] = useState(-122.4194);
    const [addressLabel, setAddressLabel] = useState('Home (123 Market St)');

    // Data lists
    const [shops, setShops] = useState<Shop[]>([]);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingShops, setLoadingShops] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // UI overlays & interaction
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredShopId, setHoveredShopId] = useState<string | null>(null);

    // Map Navigation (Pan / Zoom)
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [zoomScale, setZoomScale] = useState(25000); // Lat/Lng to pixel multiplier
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // Fetch nearby shops
    const fetchShops = async () => {
        setLoadingShops(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/shops?lat=${userLat}&lng=${userLng}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setShops(data.data || []);
            }
        } catch (err) {
            console.error('Error fetching shops:', err);
        } finally {
            setLoadingShops(false);
        }
    };

    useEffect(() => {
        fetchShops();
    }, [userLat, userLng]);

    // Fetch products for selected shop
    const selectShop = async (shop: Shop) => {
        setSelectedShop(shop);
        setLoadingProducts(true);
        // Smoothly center the map view on the selected shop
        const canvas = mapCanvasRef.current;
        if (canvas) {
            // Offset required to place the shop in center
            // pixelX = centerX + (lng - centerLng) * scale + panOffset.x
            // We want pixelX to equal centerX, so panOffset.x = -(lng - centerLng) * scale
            setPanOffset({
                x: -(shop.lng - userLng) * zoomScale,
                y: (shop.lat - userLat) * zoomScale
            });
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/shops/${shop.id}/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setProducts(data.data || []);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
        } finally {
            setLoadingProducts(false);
        }
    };

    // Draw Map on Canvas
    useEffect(() => {
        const canvas = mapCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animFrame: number;
        let pulsePhase = 0;

        const drawMap = () => {
            pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
            const w = (canvas.width = canvas.parentElement?.clientWidth || 800);
            const h = (canvas.height = canvas.parentElement?.clientHeight || 500);
            const cx = w / 2;
            const cy = h / 2;

            ctx.clearRect(0, 0, w, h);

            // 1. Draw premium dark styling grid lines
            ctx.strokeStyle = '#1e293b'; // slate-800
            ctx.lineWidth = 1;
            const gridSize = 40;
            const startX = (panOffset.x % gridSize);
            const startY = (panOffset.y % gridSize);

            for (let x = startX; x < w; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            for (let y = startY; y < h; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Function to translate lat/lng to canvas pixels
            const toPixels = (lat: number, lng: number) => {
                return {
                    x: cx + (lng - userLng) * zoomScale + panOffset.x,
                    y: cy - (lat - userLat) * zoomScale + panOffset.y
                };
            };

            // 2. Draw customer home pin
            const homePos = toPixels(userLat, userLng);
            
            // Pulse circle under home
            const homePulse = 15 + Math.sin(pulsePhase) * 5;
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // blue-500 light
            ctx.beginPath();
            ctx.arc(homePos.x, homePos.y, homePulse, 0, Math.PI * 2);
            ctx.fill();

            // Core home point
            ctx.fillStyle = '#3b82f6'; // blue-500
            ctx.beginPath();
            ctx.arc(homePos.x, homePos.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#94a3b8'; // slate-400
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Your Location', homePos.x, homePos.y - 12);

            // 3. Draw Shops
            shops.forEach((shop) => {
                const pos = toPixels(shop.lat, shop.lng);
                const isHovered = shop.id === hoveredShopId || shop.id === selectedShop?.id;

                // Delivery Range Area (dashed circle)
                const rangeRadius = (shop.delivery_radius_km / 111) * zoomScale; // Approx 111km per lat degree
                ctx.strokeStyle = isHovered ? 'rgba(168, 85, 247, 0.3)' : 'rgba(71, 85, 105, 0.15)'; // purple vs slate
                ctx.lineWidth = isHovered ? 2 : 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, rangeRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]); // reset

                // Pulsing ring if selected or hovered
                if (isHovered) {
                    ctx.fillStyle = 'rgba(168, 85, 247, 0.05)';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, rangeRadius, 0, Math.PI * 2);
                    ctx.fill();

                    const itemPulse = 12 + Math.sin(pulsePhase * 1.5) * 3;
                    ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, itemPulse, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Draw shop core marker
                ctx.fillStyle = isHovered ? '#a855f7' : '#64748b'; // purple vs slate
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Shop title
                ctx.fillStyle = isHovered ? '#f3e8ff' : '#cbd5e1';
                ctx.font = isHovered ? 'bold 12px sans-serif' : '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(shop.name, pos.x, pos.y - 14);

                // Category tag text
                ctx.fillStyle = isHovered ? '#c084fc' : '#64748b';
                ctx.font = '9px sans-serif';
                ctx.fillText(shop.category, pos.x, pos.y + 16);
            });

            animFrame = requestAnimationFrame(drawMap);
        };

        drawMap();

        return () => {
            cancelAnimationFrame(animFrame);
        };
    }, [shops, hoveredShopId, selectedShop, panOffset, zoomScale, userLat, userLng]);

    // Canvas Mouse handlers for pan dragging
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = mapCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDragging.current) {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            dragStart.current = { x: e.clientX, y: e.clientY };
        } else {
            // Check for hovered shops
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            let foundHoverId: string | null = null;

            for (const shop of shops) {
                const sx = cx + (shop.lng - userLng) * zoomScale + panOffset.x;
                const sy = cy - (shop.lat - userLat) * zoomScale + panOffset.y;
                const dist = Math.sqrt((mouseX - sx) ** 2 + (mouseY - sy) ** 2);
                if (dist < 15) {
                    foundHoverId = shop.id;
                    break;
                }
            }
            setHoveredShopId(foundHoverId);
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // If we clicked on a shop without dragging much, select it!
        isDragging.current = false;
        if (hoveredShopId) {
            const clickedShop = shops.find(s => s.id === hoveredShopId);
            if (clickedShop) selectShop(clickedShop);
        }
    };

    // Zoom controls
    const zoomIn = () => setZoomScale(prev => Math.min(prev + 5000, 60000));
    const zoomOut = () => setZoomScale(prev => Math.max(prev - 5000, 10000));

    // Cart Handlers
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item => 
                    item.product.id === product.id 
                        ? { ...item, quantity: Math.min(item.quantity + 1, product.stock_qty) } 
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
        // Open Cart overlay to show the item flying/adding success
        setIsCartOpen(true);
    };

    const updateQty = (prodId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.id === prodId) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : null;
            }
            return item;
        }).filter(Boolean) as CartItem[]);
    };

    const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    // Proceed to Checkout
    const handleCheckout = () => {
        if (cart.length === 0) return;
        // Save temporary checkout details
        localStorage.setItem('checkoutShopId', selectedShop?.id || '');
        localStorage.setItem('checkoutItems', JSON.stringify(cart));
        router.push('/checkout');
    };

    const filteredShops = shops.filter(shop => 
        shop.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        shop.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            {/* Top Premium Navigation Header */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/60 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <ShoppingBag size={20} />
                    </span>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white">HyperLocal Marketplace</h1>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <MapPin size={12} className="text-blue-500" />
                            <span>Deliver to: {addressLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search Field */}
                    <div className="relative hidden md:block">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                            <Search size={16} />
                        </span>
                        <input
                            id="search-shop-input"
                            type="text"
                            placeholder="Search grocery, restaurants..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-950/50 border border-slate-800 rounded-xl py-1.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-64 transition-all"
                        />
                    </div>

                    {/* Cart Trigger Button */}
                    <motion.button
                        id="cart-trigger-btn"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsCartOpen(true)}
                        className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all flex items-center gap-2"
                    >
                        <ShoppingCart size={18} />
                        {cart.length > 0 && (
                            <span id="cart-badge-count" className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-950 shadow-md">
                                {cart.reduce((sum, item) => sum + item.quantity, 0)}
                            </span>
                        )}
                    </motion.button>
                </div>
            </header>

            {/* Main Content Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Shop list panel */}
                <div className="w-full md:w-96 border-r border-slate-800 bg-slate-900/20 flex flex-col z-20">
                    
                    {/* Search field for mobile */}
                    <div className="p-4 md:hidden border-b border-slate-800">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                                <Search size={16} />
                            </span>
                            <input
                                type="text"
                                placeholder="Search shops..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white"
                            />
                        </div>
                    </div>

                    {/* Shop List / Section title */}
                    <div className="p-4 flex items-center justify-between border-b border-slate-800/40">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nearby Stores</span>
                        <span className="text-xs text-blue-400">{filteredShops.length} stores found</span>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
                        {loadingShops ? (
                            <div className="flex flex-col items-center justify-center h-48 gap-3">
                                <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm text-slate-400">Locating nearby shops...</span>
                            </div>
                        ) : filteredShops.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">
                                No shops found in your immediate delivery radius.
                            </div>
                        ) : (
                            filteredShops.map((shop) => (
                                <motion.div
                                    id={`shop-card-${shop.id}`}
                                    key={shop.id}
                                    whileHover={{ backgroundColor: 'rgba(30, 41, 59, 0.3)' }}
                                    onClick={() => selectShop(shop)}
                                    onMouseEnter={() => setHoveredShopId(shop.id)}
                                    onMouseLeave={() => setHoveredShopId(null)}
                                    className={`p-4 cursor-pointer transition-all flex items-center justify-between ${
                                        selectedShop?.id === shop.id ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''
                                    }`}
                                >
                                    <div className="space-y-1">
                                        <div className="font-semibold text-white text-sm">{shop.name}</div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">{shop.category}</span>
                                            <span className="flex items-center gap-0.5 text-amber-400">
                                                <Star size={12} fill="currentColor" /> {shop.rating_avg.toFixed(1)}
                                            </span>
                                            <span>•</span>
                                            <span>{shop.distance} away</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-500" />
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                {/* Center / Right: Interactive Canvas Map & Product Drawer */}
                <div className="flex-1 relative flex overflow-hidden">
                    
                    {/* Interactive Canvas Viewport */}
                    <div className="flex-1 h-full relative bg-slate-950">
                        <canvas
                            ref={mapCanvasRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            className="w-full h-full block cursor-grab active:cursor-grabbing"
                        />

                        {/* Interactive Zoom Controls Overlay */}
                        <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-30">
                            <button
                                onClick={zoomIn}
                                className="h-10 w-10 bg-slate-900 border border-slate-800 text-white font-bold text-lg rounded-xl flex items-center justify-center shadow-lg hover:bg-slate-800 transition-colors"
                            >
                                +
                            </button>
                            <button
                                onClick={zoomOut}
                                className="h-10 w-10 bg-slate-900 border border-slate-800 text-white font-bold text-lg rounded-xl flex items-center justify-center shadow-lg hover:bg-slate-800 transition-colors"
                            >
                                -
                            </button>
                        </div>

                        {/* Helper Tip Overlay */}
                        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-400 pointer-events-none">
                            Drag to pan the map. Click a shop pin to open its products.
                        </div>
                    </div>

                    {/* Products Inventory Slider (Slides in from the right when a shop is selected) */}
                    <AnimatePresence>
                        {selectedShop && (
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-slate-900 border-l border-slate-800 shadow-2xl z-30 flex flex-col"
                            >
                                {/* Selected Shop Header */}
                                <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <button 
                                            onClick={() => setSelectedShop(null)}
                                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium mb-1.5"
                                        >
                                            <ArrowLeft size={12} /> Back to Map
                                        </button>
                                        <h2 className="text-xl font-bold text-white tracking-tight">{selectedShop.name}</h2>
                                        <p className="text-xs text-slate-400">Interactive shop menu & inventory</p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedShop(null)}
                                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Product List */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    {loadingProducts ? (
                                        <div className="flex flex-col items-center justify-center h-48 gap-3">
                                            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-xs text-slate-400">Loading catalog...</span>
                                        </div>
                                    ) : products.length === 0 ? (
                                        <p className="text-center text-sm text-slate-500 py-8">
                                            No products available in this store.
                                        </p>
                                    ) : (
                                        products.map((prod) => (
                                            <div 
                                                id={`product-card-${prod.id}`}
                                                key={prod.id}
                                                className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-4"
                                            >
                                                {/* Left: details */}
                                                <div className="flex-1 space-y-1">
                                                    <h3 className="font-semibold text-sm text-white">{prod.name}</h3>
                                                    <p className="text-xs text-slate-400 line-clamp-2">{prod.description}</p>
                                                    <div className="text-sm font-bold text-blue-400 mt-2">${prod.price.toFixed(2)}</div>
                                                    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 mt-1">
                                                        Stock: {prod.stock_qty} available
                                                    </span>
                                                </div>

                                                {/* Right: add CTA */}
                                                <motion.button
                                                    id={`add-to-cart-${prod.id}`}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => addToCart(prod)}
                                                    className="h-10 w-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-lg transition-colors shadow-blue-500/10"
                                                >
                                                    <Plus size={18} />
                                                </motion.button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Shopping Cart Slider Overlay */}
            <AnimatePresence>
                {isCartOpen && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
                        {/* Dismiss backdrop click handler */}
                        <div className="absolute inset-0" onClick={() => setIsCartOpen(false)} />

                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="relative z-10 w-full max-w-md bg-slate-900 h-full border-l border-slate-800 flex flex-col shadow-2xl"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
                                <div className="flex items-center gap-2">
                                    <ShoppingCart size={18} className="text-blue-500" />
                                    <h3 className="text-lg font-bold text-white">Your Cart</h3>
                                </div>
                                <button 
                                    onClick={() => setIsCartOpen(false)}
                                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Cart List */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {cart.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm py-12">
                                        Your shopping cart is empty.
                                    </div>
                                ) : (
                                    cart.map((item) => (
                                        <div key={item.product.id} className="p-3 bg-slate-950/30 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-white truncate">{item.product.name}</div>
                                                <div className="text-xs text-blue-400 font-semibold mt-0.5">${(item.product.price * item.quantity).toFixed(2)}</div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                                                <button 
                                                    onClick={() => updateQty(item.product.id, -1)}
                                                    className="p-1 text-slate-400 hover:text-white"
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span id={`cart-qty-${item.product.id}`} className="text-sm font-semibold px-1 text-white">{item.quantity}</span>
                                                <button 
                                                    onClick={() => updateQty(item.product.id, 1)}
                                                    className="p-1 text-slate-400 hover:text-white"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Footer / Summary */}
                            {cart.length > 0 && (
                                <div className="p-6 border-t border-slate-800 bg-slate-950/40 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">Cart Subtotal</span>
                                        <span id="cart-subtotal" className="font-bold text-white text-base">${cartSubtotal.toFixed(2)}</span>
                                    </div>
                                    <button
                                        id="checkout-btn"
                                        onClick={handleCheckout}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 transition-colors"
                                    >
                                        <CreditCard size={16} />
                                        Proceed to Checkout
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
