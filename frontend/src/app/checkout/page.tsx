'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
    CreditCard, ArrowLeft, MapPin, Truck, ShieldCheck, 
    Calendar, CheckCircle, AlertCircle, ShoppingBag, Plus 
} from 'lucide-react';
import confetti from 'canvas-confetti';

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

interface Address {
    id: string;
    label: string;
    full_address: string;
    lat: number;
    lng: number;
}

export default function CheckoutPage() {
    const router = useRouter();
    
    // Checkout states
    const [shopId, setShopId] = useState('');
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [deliveryType, setDeliveryType] = useState<'standard' | 'premium'>('standard');
    
    // Address Addition Modal state
    const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
    const [newAddressLabel, setNewAddressLabel] = useState('Home');
    const [newAddressFull, setNewAddressFull] = useState('');
    const [newAddressLat, setNewAddressLat] = useState(37.7749);
    const [newAddressLng, setNewAddressLng] = useState(-122.4194);
    
    // Payment Form state
    const [cardNumber, setCardNumber] = useState('');
    const [cvv, setCvv] = useState('');
    const [expiry, setExpiry] = useState('');
    
    // Transaction Process states
    const [statusStep, setStatusStep] = useState(0); // 0: Idle, 1: Validating, 2: Charging, 3: Creating Order, 4: Complete
    const [isProcessing, setIsProcessing] = useState(false);
    const [checkoutError, setCheckoutError] = useState('');
    const [orderIdCreated, setOrderIdCreated] = useState('');

    // Load checkout data
    useEffect(() => {
        const storedShopId = localStorage.getItem('checkoutShopId') || '';
        const storedItems = JSON.parse(localStorage.getItem('checkoutItems') || '[]');
        setShopId(storedShopId);
        setCartItems(storedItems);

        fetchAddresses();
    }, []);

    // Fetch user addresses
    const fetchAddresses = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/addresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok) {
                setAddresses(result.data || []);
                if (result.data && result.data.length > 0) {
                    setSelectedAddressId(result.data[0].id);
                }
            }
        } catch (err) {
            console.error('Error fetching addresses:', err);
        }
    };

    // Add customer address
    const handleAddAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/addresses', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    label: newAddressLabel,
                    lat: newAddressLat,
                    lng: newAddressLng,
                    fullAddress: newAddressFull
                })
            });
            const result = await res.json();
            if (res.ok) {
                setIsAddAddressOpen(false);
                setNewAddressFull('');
                await fetchAddresses();
                setSelectedAddressId(result.data.id);
            }
        } catch (err) {
            console.error('Error creating address:', err);
        }
    };

    // Submit Checkout
    const handleCheckoutSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAddressId) {
            setCheckoutError('Please choose a delivery address.');
            return;
        }

        setCheckoutError('');
        setIsProcessing(true);
        setStatusStep(1);

        const token = localStorage.getItem('token');
        const formattedItems = cartItems.map(item => ({
            productId: item.product.id,
            quantity: item.quantity
        }));

        const slotId = deliveryType === 'premium' ? `slot-${shopId}-premium` : `slot-${shopId}-standard`;

        // Run visual simulation checklist timers
        setTimeout(() => {
            setStatusStep(2); // Charging card
            setTimeout(() => {
                setStatusStep(3); // Creating Order Record
            }, 1000);
        }, 1000);

        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    shopId,
                    addressId: selectedAddressId,
                    slotId,
                    cartItems: formattedItems,
                    paymentDetails: {
                        cardNumber,
                        cvv,
                        expiry
                    }
                })
            });

            const result = await res.json();
            
            // Wait for visual steps to complete or catch up
            setTimeout(() => {
                if (!res.ok || !result.success) {
                    setCheckoutError(result.error || 'Checkout process declined.');
                    setIsProcessing(false);
                    setStatusStep(0);
                } else {
                    setStatusStep(4); // Success!
                    setOrderIdCreated(result.orderId);
                    
                    // Trigger confetti splash!
                    confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 },
                        colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']
                    });

                    // Clear shopping cart on successful checkout
                    localStorage.removeItem('checkoutItems');
                    localStorage.removeItem('checkoutShopId');
                }
            }, 2500);

        } catch (err: any) {
            setCheckoutError(err.message || 'Payment system error.');
            setIsProcessing(false);
            setStatusStep(0);
        }
    };

    // Calculate finances
    const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const deliveryFee = 5.00;
    const premiumFee = deliveryType === 'premium' ? 4.99 : 0.00;
    const tax = subtotal * 0.08;
    const grandTotal = subtotal + deliveryFee + premiumFee + tax;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/60 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
                <button 
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                    <ArrowLeft size={14} /> Back to Dashboard
                </button>
                <h1 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Secure Checkout</h1>
                <div className="w-16" /> {/* spacer */}
            </header>

            <div className="flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left pane: Address, Delivery type, Payment details */}
                <div className="lg:col-span-8 space-y-6">
                    
                    {/* 1. Address Selection */}
                    <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <MapPin size={18} className="text-blue-500" />
                                1. Delivery Address
                            </h3>
                            <button
                                id="add-address-btn"
                                onClick={() => setIsAddAddressOpen(true)}
                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium border border-blue-500/20 bg-blue-500/5 px-2.5 py-1 rounded-lg"
                            >
                                <Plus size={14} /> Add Address
                            </button>
                        </div>

                        {addresses.length === 0 ? (
                            <p className="text-xs text-slate-500">No addresses saved. Click &apos;Add Address&apos; to create one.</p>
                        ) : (
                            <div className="space-y-3">
                                {addresses.map((addr) => (
                                    <div 
                                        key={addr.id}
                                        onClick={() => setSelectedAddressId(addr.id)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                                            selectedAddressId === addr.id 
                                                ? 'bg-blue-600/10 border-blue-500/60 shadow-md shadow-blue-500/5' 
                                                : 'bg-slate-950/20 border-slate-800/80 hover:border-slate-700'
                                        }`}
                                    >
                                        <input
                                            id={`addr-select-${addr.id}`}
                                            type="radio"
                                            name="address"
                                            checked={selectedAddressId === addr.id}
                                            onChange={() => setSelectedAddressId(addr.id)}
                                            className="text-blue-500 focus:ring-0"
                                        />
                                        <div className="flex-1">
                                            <div className="text-sm font-semibold text-white">{addr.label}</div>
                                            <div className="text-xs text-slate-400 mt-0.5">{addr.full_address}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 2. Delivery Options */}
                    <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                            <Truck size={18} className="text-blue-500" />
                            2. Delivery Service
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Standard */}
                            <div 
                                id="slot-select-standard"
                                onClick={() => setDeliveryType('standard')}
                                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                                    deliveryType === 'standard' 
                                        ? 'bg-blue-600/10 border-blue-500/60' 
                                        : 'bg-slate-950/20 border-slate-800/80'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-white">Standard Delivery</span>
                                    <span className="text-xs text-slate-400 font-bold">$5.00</span>
                                </div>
                                <p className="text-xs text-slate-400">Arrives in standard 2-hour window. Good for regular grocery restocks.</p>
                            </div>

                            {/* Premium */}
                            <div 
                                id="slot-select-premium"
                                onClick={() => setDeliveryType('premium')}
                                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                                    deliveryType === 'premium' 
                                        ? 'bg-blue-600/10 border-blue-500/60' 
                                        : 'bg-slate-950/20 border-slate-800/80'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-white">Instant Express (Premium)</span>
                                    <span className="text-xs text-blue-400 font-bold">$9.99</span>
                                </div>
                                <p className="text-xs text-slate-400">Pulsing instant delivery. Priority driver assigned immediately. Recommended.</p>
                            </div>
                        </div>
                    </div>

                    {/* 3. Secure Card Payment */}
                    <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                            <CreditCard size={18} className="text-blue-500" />
                            3. Card Payment details
                        </h3>

                        <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                            {checkoutError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    <span>{checkoutError}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Card Number</label>
                                <input
                                    id="card-number-input"
                                    type="text"
                                    required
                                    placeholder="4242 4242 4242 4242"
                                    value={cardNumber}
                                    onChange={(e) => setCardNumber(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-[10px] text-slate-500 mt-1 block">To test successful flow, card must start with 4242.</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Expiration (MM/YY)</label>
                                    <input
                                        id="card-expiry-input"
                                        type="text"
                                        required
                                        placeholder="12/28"
                                        value={expiry}
                                        onChange={(e) => setExpiry(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">CVV</label>
                                    <input
                                        id="card-cvv-input"
                                        type="password"
                                        required
                                        placeholder="123"
                                        value={cvv}
                                        onChange={(e) => setCvv(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none"
                                    />
                                </div>
                            </div>

                            <button
                                id="pay-submit-btn"
                                type="submit"
                                disabled={isProcessing || cartItems.length === 0}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 mt-6 shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ShieldCheck size={18} />
                                Pay & Confirm ${grandTotal.toFixed(2)}
                            </button>
                        </form>
                    </div>

                </div>

                {/* Right pane: Checkout receipt summary */}
                <div className="lg:col-span-4 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800/60 pb-3">
                        <ShoppingBag size={18} className="text-blue-500" />
                        Order Summary
                    </h3>

                    {/* Items breakdown */}
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {cartItems.map((item) => (
                            <div key={item.product.id} className="flex justify-between items-center text-sm">
                                <div className="text-slate-300 min-w-0 pr-2">
                                    <span className="font-semibold text-white">{item.quantity}x</span> {item.product.name}
                                </div>
                                <span className="font-medium text-slate-100 flex-shrink-0">${(item.product.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Receipt breakdown */}
                    <div className="space-y-2 border-t border-slate-850 pt-4 text-xs text-slate-400">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="font-medium text-slate-300">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Delivery Fee</span>
                            <span className="font-medium text-slate-300">${deliveryFee.toFixed(2)}</span>
                        </div>
                        {premiumFee > 0 && (
                            <div className="flex justify-between text-blue-400">
                                <span>Express Premium Fee</span>
                                <span className="font-medium">${premiumFee.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span>Estimated Taxes (8%)</span>
                            <span className="font-medium text-slate-300">${tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-bold text-white border-t border-slate-850 pt-3">
                            <span>Total Due</span>
                            <span id="checkout-total-val" className="text-base text-blue-400">${grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Address addition modal overlay */}
            <AnimatePresence>
                {isAddAddressOpen && (
                    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl relative"
                        >
                            <h4 className="text-base font-bold text-white mb-4">Add Address Details</h4>
                            <form onSubmit={handleAddAddress} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Label (e.g. Home, Work)</label>
                                    <input
                                        id="new-addr-label"
                                        type="text"
                                        required
                                        value={newAddressLabel}
                                        onChange={(e) => setNewAddressLabel(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Address</label>
                                    <input
                                        id="new-addr-full"
                                        type="text"
                                        required
                                        placeholder="123 Market St, San Francisco, CA"
                                        value={newAddressFull}
                                        onChange={(e) => setNewAddressFull(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                    <div>Latitude: 37.7749</div>
                                    <div>Longitude: -122.4194</div>
                                </div>

                                <div className="flex gap-2 justify-end mt-6">
                                    <button 
                                        type="button" 
                                        onClick={() => setIsAddAddressOpen(false)}
                                        className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs border border-slate-800 bg-transparent"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        id="new-addr-submit"
                                        type="submit" 
                                        className="px-4 py-2 rounded-xl text-white bg-blue-600 hover:bg-blue-500 text-xs shadow-lg shadow-blue-500/10"
                                    >
                                        Save Address
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Transaction Processing Checklist HUD overlay */}
            <AnimatePresence>
                {isProcessing && (
                    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-slate-900 border border-slate-800/80 p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center space-y-6"
                        >
                            <h3 id="checkout-hud-title" className="text-xl font-extrabold text-white tracking-tight">Processing Payment</h3>

                            {/* Checklist steps */}
                            <div className="text-left space-y-4">
                                {/* Step 1: Validating stock */}
                                <div className="flex items-center gap-3">
                                    {statusStep >= 2 ? (
                                        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                                    ) : (
                                        <div className="h-4.5 w-4.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${statusStep >= 2 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>Verifying local shop stock</span>
                                </div>

                                {/* Step 2: Processing Payment gateway */}
                                <div className="flex items-center gap-3">
                                    {statusStep >= 3 ? (
                                        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                                    ) : statusStep === 2 ? (
                                        <div className="h-4.5 w-4.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                    ) : (
                                        <div className="h-4.5 w-4.5 border-2 border-slate-800 rounded-full flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${statusStep >= 3 ? 'text-slate-300 font-medium' : statusStep === 2 ? 'text-blue-400 font-medium' : 'text-slate-500'}`}>Charging card gateway</span>
                                </div>

                                {/* Step 3: Generating order */}
                                <div className="flex items-center gap-3">
                                    {statusStep >= 4 ? (
                                        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                                    ) : statusStep === 3 ? (
                                        <div className="h-4.5 w-4.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                    ) : (
                                        <div className="h-4.5 w-4.5 border-2 border-slate-800 rounded-full flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${statusStep >= 4 ? 'text-slate-300 font-medium' : statusStep === 3 ? 'text-blue-400 font-medium' : 'text-slate-500'}`}>Finalizing database registers</span>
                                </div>
                            </div>

                            {/* Completed state */}
                            {statusStep === 4 && (
                                <motion.div 
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="pt-4 space-y-4"
                                >
                                    <div className="text-emerald-400 font-bold text-sm">Order Placed Successfully! 🎉</div>
                                    <button
                                        id="track-order-redirect-btn"
                                        onClick={() => router.push(`/tracking/${orderIdCreated}`)}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Calendar size={16} />
                                        Track Order Live
                                    </button>
                                </motion.div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
