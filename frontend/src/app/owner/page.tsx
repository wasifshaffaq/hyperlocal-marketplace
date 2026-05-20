'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
    Store, ClipboardList, ShoppingCart, Play, CheckCircle, 
    ArrowRight, LogOut, Package, PlusCircle, Trash, DollarSign 
} from 'lucide-react';

interface Order {
    id: string;
    customer_id: string;
    shop_id: string;
    address_id: string;
    status: string;
    delivery_type: string;
    subtotal: string;
    delivery_fee: string;
    tax: string;
    total: string;
    payment_status: string;
    created_at: string;
    shop_name?: string;
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

interface Shop {
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    delivery_radius_km: number;
    is_open: boolean;
    rating_avg: number;
}

export default function OwnerDashboard() {
    const router = useRouter();

    // Data lists
    const [orders, setOrders] = useState<Order[]>([]);
    const [myShop, setMyShop] = useState<Shop | null>(null);
    const [products, setProducts] = useState<Product[]>([]);

    // Form inputs for creating products
    const [newProdName, setNewProdName] = useState('');
    const [newProdDesc, setNewProdDesc] = useState('');
    const [newProdPrice, setNewProdPrice] = useState('');
    const [newProdStock, setNewProdStock] = useState('50');

    // UI control states
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [activeTab, setActiveTab] = useState<'orders' | 'catalog'>('orders');
    const [simulatingOrderId, setSimulatingOrderId] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const role = localStorage.getItem('role');
        if (role !== 'SHOP_OWNER') {
            router.push('/');
            return;
        }

        fetchShopAndProducts();
        fetchOrdersQueue();
    }, []);

    // Fetch the shop details and product list
    const fetchShopAndProducts = async () => {
        try {
            const token = localStorage.getItem('token');
            const userId = localStorage.getItem('userId');

            // 1. Fetch shops
            const res = await fetch('/api/shops', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok) {
                // Find shop matching current owner
                const shopMatch = (result.data || []).find((s: Shop) => s.id === 'shop-grocery' || s.id === 'shop-pizza'); // Match seeded mock shops or custom ones
                if (shopMatch) {
                    setMyShop(shopMatch);
                    
                    // 2. Fetch products
                    setLoadingProducts(true);
                    const prodRes = await fetch(`/api/shops/${shopMatch.id}/products`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const prodResult = await prodRes.json();
                    if (prodRes.ok) {
                        setProducts(prodResult.data || []);
                    }
                    setLoadingProducts(false);
                }
            }
        } catch (err) {
            console.error('Error loading shop catalog:', err);
        }
    };

    // Fetch orders queue
    const fetchOrdersQueue = async () => {
        setLoadingOrders(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/orders/owner', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok) {
                setOrders(result.data || []);
            }
        } catch (err) {
            console.error('Error fetching orders queue:', err);
        } finally {
            setLoadingOrders(false);
        }
    };

    // Trigger driver simulation
    const handleStartSimulation = async (orderId: string) => {
        setSimulatingOrderId(orderId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/orders/${orderId}/simulate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok) {
                setSuccessMessage('Dispatch simulation successfully initialized! Driving progress is now active.');
                // Refresh list
                await fetchOrdersQueue();
            } else {
                setErrorMessage(result.error || 'Failed to initialize simulation.');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'Error running simulation.');
        } finally {
            setSimulatingOrderId(null);
        }
    };

    // Create custom product item
    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!myShop) return;
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/shops/${myShop.id}/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newProdName,
                    description: newProdDesc,
                    price: parseFloat(newProdPrice),
                    stockQty: parseInt(newProdStock),
                    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=200',
                    isAvailable: true
                })
            });

            if (res.ok) {
                setSuccessMessage('Menu item registered successfully!');
                setNewProdName('');
                setNewProdDesc('');
                setNewProdPrice('');
                setNewProdStock('50');
                // Reload
                fetchShopAndProducts();
            } else {
                const result = await res.json();
                setErrorMessage(result.error || 'Could not register product item.');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'Network catalog error.');
        }
    };

    // Logout
    const handleLogout = () => {
        localStorage.clear();
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/60 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        <Store size={20} />
                    </span>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white">Owner Portal</h1>
                        <span id="shop-name-banner" className="text-xs text-slate-400">Managing catalog & dispatches: {myShop ? myShop.name : 'Initializing...'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 font-medium transition-colors bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg"
                    >
                        <LogOut size={14} /> Log Out
                    </button>
                </div>
            </header>

            {/* Layout Grid */}
            <div className="max-w-6xl w-full mx-auto p-6 flex-1 flex flex-col gap-6">
                
                {/* Status Banners */}
                {successMessage && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm px-4 py-2.5 rounded-xl">
                        {successMessage}
                    </div>
                )}
                {errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-2.5 rounded-xl">
                        {errorMessage}
                    </div>
                )}

                {/* Navigation tabs */}
                <div className="flex gap-2 border-b border-slate-800 pb-2">
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                            activeTab === 'orders' 
                                ? 'border-violet-500 text-violet-400' 
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <ClipboardList size={16} /> Order Dispatch Queue ({orders.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('catalog')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                            activeTab === 'catalog' 
                                ? 'border-violet-500 text-violet-400' 
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Package size={16} /> Shop Menu Catalog ({products.length})
                    </button>
                </div>

                {/* Dashboard body views */}
                <div className="flex-1">
                    
                    {/* View A: Orders Queue list */}
                    {activeTab === 'orders' && (
                        <div className="space-y-4">
                            {loadingOrders ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs text-slate-400">Syncing incoming dispatches...</span>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 text-sm bg-slate-900/10 border border-slate-850 rounded-2xl">
                                    No customer orders placed yet. Place orders from the Customer Dashboard first.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {orders.map((order) => (
                                        <div 
                                            id={`owner-order-card-${order.id}`}
                                            key={order.id} 
                                            className="p-5 bg-slate-900/40 border border-slate-850 rounded-2xl space-y-4 flex flex-col justify-between"
                                        >
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider">Order #{order.id.slice(0, 8)}</span>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-violet-300 border border-violet-500/10">
                                                        {order.status}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-xs text-slate-400 flex justify-between">
                                                        <span>Payment Status:</span>
                                                        <span className="text-emerald-400 font-semibold">{order.payment_status}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-400 flex justify-between">
                                                        <span>Delivery Class:</span>
                                                        <span className="text-slate-200 capitalize font-medium">{order.delivery_type}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-400 flex justify-between">
                                                        <span>Order Total:</span>
                                                        <span className="text-slate-200 font-bold">${parseFloat(order.total).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Simulate actions */}
                                            <div className="pt-4 border-t border-slate-800/60 flex items-center gap-2">
                                                {order.status !== 'DELIVERED' && order.status !== 'OUT_FOR_DELIVERY' && (
                                                    <button
                                                        id={`simulate-btn-${order.id}`}
                                                        onClick={() => handleStartSimulation(order.id)}
                                                        disabled={simulatingOrderId === order.id}
                                                        className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-violet-500/10 disabled:opacity-50"
                                                    >
                                                        {simulatingOrderId === order.id ? (
                                                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Play size={13} fill="currentColor" />
                                                                Accept & Simulate Dispatch
                                                            </>
                                                        )}
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => router.push(`/tracking/${order.id}`)}
                                                    className="flex-1 border border-slate-800 bg-transparent hover:bg-slate-900 text-slate-300 font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors"
                                                >
                                                    Open Tracker
                                                    <ArrowRight size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* View B: Menu Manager catalog */}
                    {activeTab === 'catalog' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            
                            {/* Catalog inventory list */}
                            <div className="lg:col-span-8 space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">Current Shop Inventory</h3>
                                {loadingProducts ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                                        <div className="h-5 w-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-xs text-slate-400">Loading catalog items...</span>
                                    </div>
                                ) : products.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No items in the shop catalog yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {products.map((prod) => (
                                            <div 
                                                key={prod.id} 
                                                className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl flex justify-between items-center gap-4"
                                            >
                                                <div>
                                                    <div className="font-semibold text-white text-sm">{prod.name}</div>
                                                    <div className="text-xs text-slate-400 mt-1 line-clamp-1">{prod.description}</div>
                                                    <div className="flex gap-3 text-[10px] text-slate-500 mt-1.5">
                                                        <span>Price: <strong className="text-violet-400">${prod.price.toFixed(2)}</strong></span>
                                                        <span>Stock: <strong className="text-slate-300">{prod.stock_qty}</strong></span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Catalog Add form */}
                            <div className="lg:col-span-4 bg-slate-900/40 border border-slate-850 p-6 rounded-2xl space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-2">
                                    <PlusCircle size={16} className="text-violet-500" />
                                    Add Catalog Item
                                </h3>

                                <form onSubmit={handleAddProduct} className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Product Name</label>
                                        <input
                                            id="new-prod-name"
                                            type="text"
                                            required
                                            placeholder="Fresh Apples"
                                            value={newProdName}
                                            onChange={(e) => setNewProdName(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</label>
                                        <textarea
                                            id="new-prod-desc"
                                            required
                                            placeholder="Organic crisp honeycrisp apples..."
                                            value={newProdDesc}
                                            onChange={(e) => setNewProdDesc(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white h-16 resize-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Price ($)</label>
                                            <input
                                                id="new-prod-price"
                                                type="number"
                                                step="0.01"
                                                required
                                                placeholder="2.99"
                                                value={newProdPrice}
                                                onChange={(e) => setNewProdPrice(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Initial Stock</label>
                                            <input
                                                id="new-prod-stock"
                                                type="number"
                                                required
                                                placeholder="50"
                                                value={newProdStock}
                                                onChange={(e) => setNewProdStock(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        id="add-prod-submit-btn"
                                        type="submit"
                                        className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-2 rounded-xl text-xs shadow-lg shadow-violet-500/10 flex items-center justify-center gap-1"
                                    >
                                        Save Menu Item
                                    </button>
                                </form>
                            </div>

                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}
