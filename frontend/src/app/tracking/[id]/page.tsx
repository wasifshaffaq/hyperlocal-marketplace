'use client';

import React, { useEffect, useRef, useState, use } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
    ArrowLeft, MapPin, Truck, Store, Calendar, 
    CheckCircle, ShieldAlert, Award, Package, Clock 
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface Order {
    id: string;
    customer_id: string;
    shop_id: string;
    address_id: string;
    status: string;
    delivery_type: string;
    total: string;
    created_at: string;
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function OrderTrackingPage({ params }: PageProps) {
    const { id: orderId } = use(params);
    const router = useRouter();
    const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    // Order state
    const [order, setOrder] = useState<Order | null>(null);
    const [shopName, setShopName] = useState('Store');
    const [shopLat, setShopLat] = useState(37.7794);
    const [shopLng, setShopLng] = useState(-122.4154);
    
    const [destLabel, setDestLabel] = useState('Destination');
    const [destLat, setDestLat] = useState(37.7749);
    const [destLng, setDestLng] = useState(-122.4194);
    
    const [currentStatus, setCurrentStatus] = useState('PLACED');
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    // Driver Coordinates
    const [driverLat, setDriverLat] = useState<number | null>(null);
    const [driverLng, setDriverLng] = useState<number | null>(null);

    // LERP positions for smooth gliding animation
    const lerpedLat = useRef<number | null>(null);
    const lerpedLng = useRef<number | null>(null);

    // Map Pan / Zoom
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [zoomScale, setZoomScale] = useState(32000);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // Fetch initial order details
    const fetchOrderDetails = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/orders', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok) {
                const match = (result.data || []).find((o: Order) => o.id === orderId);
                if (match) {
                    setOrder(match);
                    setCurrentStatus(match.status);

                    // Fetch coordinates of matching shop
                    const shopRes = await fetch('/api/shops', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const shopData = await shopRes.json();
                    if (shopRes.ok) {
                        const sMatch = (shopData.data || []).find((s: any) => s.id === match.shop_id);
                        if (sMatch) {
                            setShopName(sMatch.name);
                            setShopLat(sMatch.lat);
                            setShopLng(sMatch.lng);
                            // Initial driver starts at the shop
                            setDriverLat(sMatch.lat);
                            setDriverLng(sMatch.lng);
                        }
                    }

                    // Fetch coordinates of matching address
                    const addrRes = await fetch('/api/addresses', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const addrData = await addrRes.json();
                    if (addrRes.ok) {
                        const aMatch = (addrData.data || []).find((a: any) => a.id === match.address_id);
                        if (aMatch) {
                            setDestLabel(aMatch.label);
                            setDestLat(aMatch.lat);
                            setDestLng(aMatch.lng);
                        }
                    }
                } else {
                    setErrorMsg('Order details not found.');
                }
            } else {
                setErrorMsg('Could not query order list.');
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Error fetching details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrderDetails();
    }, [orderId]);

    // WebSocket Tracking subscriber
    useEffect(() => {
        if (!orderId) return;

        // Establish WS connection to backend port 3000
        const wsUrl = `ws://localhost:3000/ws/tracking`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log('[TRACKING-WS] Connected to tracking WebSocket.');
            // Send subscription packet
            ws.send(JSON.stringify({
                type: 'subscribe',
                orderId: orderId
            }));
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('[TRACKING-WS] Received message:', message);

                if (message.type === 'STATUS_UPDATE') {
                    setCurrentStatus(message.status);
                    if (message.status === 'DELIVERED') {
                        // Play a small success celebration
                        confetti({
                            particleCount: 80,
                            spread: 60,
                            origin: { y: 0.7 }
                        });
                    }
                } else if (message.type === 'LOCATION_UPDATE') {
                    setDriverLat(message.lat);
                    setDriverLng(message.lng);
                }
            } catch (err) {
                console.error('[TRACKING-WS] Error decoding message:', err);
            }
        };

        ws.onerror = (err) => {
            console.error('[TRACKING-WS] Connection error:', err);
        };

        ws.onclose = () => {
            console.log('[TRACKING-WS] Closed connection.');
        };

        return () => {
            ws.close();
        };
    }, [orderId]);

    // Canvas drawing and LERP interpolation loop
    useEffect(() => {
        const canvas = mapCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animFrame: number;
        let pulsePhase = 0;

        const drawTrackingMap = () => {
            pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
            const w = (canvas.width = canvas.parentElement?.clientWidth || 800);
            const h = (canvas.height = canvas.parentElement?.clientHeight || 500);
            const cx = w / 2;
            const cy = h / 2;

            ctx.clearRect(0, 0, w, h);

            // Coordinates translation setup
            // Center map at midpoint between Shop and Destination
            const midLat = (shopLat + destLat) / 2;
            const midLng = (shopLng + destLng) / 2;

            const toPixels = (lat: number, lng: number) => {
                return {
                    x: cx + (lng - midLng) * zoomScale + panOffset.x,
                    y: cy - (lat - midLat) * zoomScale + panOffset.y
                };
            };

            // Grid background lines
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

            const shopPos = toPixels(shopLat, shopLng);
            const destPos = toPixels(destLat, destLng);

            // Interpolate driver position for smooth gliding motion (LERP)
            if (driverLat !== null && driverLng !== null) {
                if (lerpedLat.current === null || lerpedLng.current === null) {
                    lerpedLat.current = driverLat;
                    lerpedLng.current = driverLng;
                } else {
                    lerpedLat.current += (driverLat - lerpedLat.current) * 0.06;
                    lerpedLng.current += (driverLng - lerpedLng.current) * 0.06;
                }
            }

            // A. Draw full delivery route path (dashed line)
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)'; // slate-600
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(shopPos.x, shopPos.y);
            ctx.lineTo(destPos.x, destPos.y);
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // B. Draw traversed route (solid colored line)
            if (lerpedLat.current !== null && lerpedLng.current !== null) {
                const driverPos = toPixels(lerpedLat.current, lerpedLng.current);
                ctx.strokeStyle = '#8b5cf6'; // violet-500
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(shopPos.x, shopPos.y);
                ctx.lineTo(driverPos.x, driverPos.y);
                ctx.stroke();
            }

            // C. Draw Store Pin
            ctx.fillStyle = '#10b981'; // emerald-500
            ctx.beginPath();
            ctx.arc(shopPos.x, shopPos.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#a7f3d0';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(shopName, shopPos.x, shopPos.y - 14);

            // D. Draw Customer Home Pin
            ctx.fillStyle = '#3b82f6'; // blue-500
            ctx.beginPath();
            ctx.arc(destPos.x, destPos.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#bfdbfe';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(destLabel, destPos.x, destPos.y - 14);

            // E. Draw Driver Pin (gliding agent)
            if (lerpedLat.current !== null && lerpedLng.current !== null) {
                const driverPos = toPixels(lerpedLat.current, lerpedLng.current);

                // pulsing target radius
                const pulseRadius = 14 + Math.sin(pulsePhase * 2) * 4;
                ctx.fillStyle = 'rgba(139, 92, 246, 0.15)'; // purple glow
                ctx.beginPath();
                ctx.arc(driverPos.x, driverPos.y, pulseRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#8b5cf6'; // violet-500
                ctx.beginPath();
                ctx.arc(driverPos.x, driverPos.y, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = '#ddd6fe';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText('Driver', driverPos.x, driverPos.y - 16);
            }

            animFrame = requestAnimationFrame(drawTrackingMap);
        };

        drawTrackingMap();

        return () => {
            cancelAnimationFrame(animFrame);
        };
    }, [shopLat, shopLng, destLat, destLng, driverLat, driverLng, shopName, destLabel, panOffset, zoomScale]);

    // Pan canvas handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isDragging.current) {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            dragStart.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    // Zooming
    const zoomIn = () => setZoomScale(prev => Math.min(prev + 5000, 60000));
    const zoomOut = () => setZoomScale(prev => Math.max(prev - 5000, 15000));

    // Timeline Steps mapping
    const stepsList = [
        { key: 'PLACED', title: 'Order Placed', desc: 'Awaiting shop confirmation' },
        { key: 'CONFIRMED', title: 'Confirmed', desc: 'Shop has accepted the order' },
        { key: 'PREPARING', title: 'Preparing', desc: 'Ingredients are being compiled' },
        { key: 'READY_FOR_PICKUP', title: 'Ready', desc: 'Courier agent picking up cargo' },
        { key: 'OUT_FOR_DELIVERY', title: 'In Transit', desc: 'Driver is moving on the map' },
        { key: 'DELIVERED', title: 'Arrived', desc: 'Order delivered to doorstep' }
    ];

    const getStepState = (stepKey: string) => {
        const orderIndexes: { [key: string]: number } = {
            'PLACED': 0,
            'CONFIRMED': 1,
            'PREPARING': 2,
            'READY_FOR_PICKUP': 3,
            'OUT_FOR_DELIVERY': 4,
            'DELIVERED': 5
        };
        const currentIdx = orderIndexes[currentStatus] ?? 0;
        const stepIdx = orderIndexes[stepKey] ?? 0;

        if (stepIdx < currentIdx) return 'completed';
        if (stepIdx === currentIdx) return 'active';
        return 'pending';
    };

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
                <div className="text-center">
                    <h1 className="text-sm font-bold text-white tracking-wide">Live Dispatch Tracker</h1>
                    <span id="order-id-label" className="text-[10px] text-slate-500 font-mono">Order ID: {orderId}</span>
                </div>
                <div className="w-16" /> {/* spacer */}
            </header>

            {/* Layout Grid */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* Left timeline checklist */}
                <div className="w-full md:w-96 border-r border-slate-800 bg-slate-900/10 flex flex-col overflow-y-auto z-20">
                    <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Delivery Milestones</span>
                        <div className="px-2.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium uppercase tracking-wider">
                            {currentStatus}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-3">
                            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-slate-400">Loading order info...</span>
                        </div>
                    ) : errorMsg ? (
                        <div className="p-6 text-red-400 text-sm flex items-center gap-2">
                            <ShieldAlert size={18} />
                            <span>{errorMsg}</span>
                        </div>
                    ) : (
                        <div className="p-6 space-y-6 flex-1">
                            {stepsList.map((step, idx) => {
                                const state = getStepState(step.key);
                                return (
                                    <div key={step.key} className="flex gap-4 relative">
                                        {/* Connector line */}
                                        {idx < stepsList.length - 1 && (
                                            <div className={`absolute left-3 top-6 bottom-0 w-0.5 -translate-x-1/2 ${
                                                state === 'completed' ? 'bg-emerald-500' : 'bg-slate-800'
                                            }`} />
                                        )}

                                        {/* State indicator circle */}
                                        <div className="relative z-10">
                                            {state === 'completed' ? (
                                                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white border-2 border-slate-950">
                                                    <CheckCircle size={14} />
                                                </div>
                                            ) : state === 'active' ? (
                                                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white border-2 border-slate-950 animate-pulse">
                                                    <Package size={12} className="animate-bounce" />
                                                </div>
                                            ) : (
                                                <div className="h-6 w-6 rounded-full bg-slate-950 border-2 border-slate-800 flex items-center justify-center text-slate-600">
                                                    <div className="h-2 w-2 rounded-full bg-current" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Text detail */}
                                        <div className="space-y-0.5">
                                            <div className={`text-sm font-semibold ${
                                                state === 'active' ? 'text-blue-400' : state === 'completed' ? 'text-white' : 'text-slate-500'
                                            }`}>
                                                {step.title}
                                            </div>
                                            <p className="text-xs text-slate-400">{step.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Center / Right: Interactive Live Canvas Map */}
                <div className="flex-1 relative h-full bg-slate-950">
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

                    {/* Helper status description pill overlay */}
                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 pointer-events-none flex items-center gap-2">
                        <Clock size={14} className="text-blue-500" />
                        <span>Order status is simulated live. Use the Shop Owner Dashboard to trigger the simulation driver runner.</span>
                    </div>
                </div>

            </div>
        </div>
    );
}
