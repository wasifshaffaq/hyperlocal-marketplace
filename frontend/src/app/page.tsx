'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Phone, User, Store, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
    const router = useRouter();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    
    // Form switching states
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState<'CUSTOMER' | 'SHOP_OWNER'>('CUSTOMER');
    
    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    // UI states
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Dynamic Canvas Particle Simulation
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const particles: Array<{
            x: number;
            y: number;
            vx: number;
            vy: number;
            radius: number;
            color: string;
        }> = [];

        // Generate particles
        const particleCount = Math.min(80, Math.floor((width * height) / 15000));
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.8,
                vy: (Math.random() - 0.5) * 0.8,
                radius: Math.random() * 2 + 1,
                color: 'rgba(255, 255, 255, 0.15)',
            });
        }

        // Mouse interaction coords
        const mouse = { x: -1000, y: -1000, active: false };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        };

        const handleMouseLeave = () => {
            mouse.active = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        // Simulation Loop
        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            // Dark space gradient background
            const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, Math.max(width, height));
            bgGrad.addColorStop(0, '#0f172a'); // slate-900
            bgGrad.addColorStop(1, '#020617'); // slate-950
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                const p1 = particles[i];
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 100) {
                        const alpha = (1 - dist / 100) * 0.12;
                        ctx.strokeStyle = `rgba(147, 197, 253, ${alpha})`; // light blue connections
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            }

            // Draw and update particles
            particles.forEach((p) => {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Move
                p.x += p.vx;
                p.y += p.vy;

                // Mouse interaction (gravity effect)
                if (mouse.active) {
                    const dx = mouse.x - p.x;
                    const dy = mouse.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 180) {
                        // Gently attract particles to mouse
                        const force = (180 - dist) / 180;
                        p.x += (dx / dist) * force * 0.4;
                        p.y += (dy / dist) * force * 0.4;
                    }
                }

                // Boundary bounce
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Form submission handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setLoading(true);

        const url = isLogin ? '/api/auth/login' : '/api/auth/register';
        const bodyPayload = isLogin 
            ? { email, password } 
            : { email, password, role, phone };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || 'Authentication failed');
            }

            if (isLogin) {
                // Save user details
                localStorage.setItem('token', result.data.token);
                localStorage.setItem('role', result.data.role);
                localStorage.setItem('userId', result.data.id);
                localStorage.setItem('email', email);

                setSuccessMsg('Authentication successful! Redirecting...');
                setTimeout(() => {
                    if (result.data.role === 'SHOP_OWNER') {
                        router.push('/owner');
                    } else {
                        router.push('/dashboard');
                    }
                }, 1000);
            } else {
                setSuccessMsg('Registration successful! Please login.');
                setIsLogin(true);
                setPassword('');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden font-sans">
            {/* Background Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 block z-0" />

            {/* Glowing Accent Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl z-0 pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl z-0 pointer-events-none" />

            {/* Main Auth Container */}
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-md mx-4"
            >
                {/* Branding / Header */}
                <div className="text-center mb-8">
                    <motion.div 
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-semibold mb-4 backdrop-blur-md"
                    >
                        <Store size={16} /> Hyperlocal Network
                    </motion.div>
                    <h1 id="app-title" className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-indigo-300 tracking-tight">
                        HyperLocal Marketplace
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        Instantly connect and order from shops in your immediate vicinity.
                    </p>
                </div>

                {/* Glassmorphic Form Card */}
                <div className="backdrop-blur-xl bg-slate-900/50 border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-slate-950/50">
                    
                    {/* Role selector (only when registering) */}
                    <AnimatePresence mode="wait">
                        {!isLogin && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-6 overflow-hidden"
                            >
                                <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">I want to register as a</label>
                                <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-1 rounded-xl border border-slate-800/60">
                                    <button
                                        id="role-customer-btn"
                                        type="button"
                                        onClick={() => setRole('CUSTOMER')}
                                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                                            role === 'CUSTOMER' 
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        <User size={15} /> Customer
                                    </button>
                                    <button
                                        id="role-owner-btn"
                                        type="button"
                                        onClick={() => setRole('SHOP_OWNER')}
                                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                                            role === 'SHOP_OWNER' 
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        <Store size={15} /> Shop Owner
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        
                        {/* Error / Success Alerts */}
                        {errorMsg && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-sm px-4 py-2.5 rounded-xl">
                                {errorMsg}
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm px-4 py-2.5 rounded-xl">
                                {successMsg}
                            </div>
                        )}

                        {/* Email Input */}
                        <div>
                            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1.5">Email Address</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                                    <Mail size={18} />
                                </span>
                                <input
                                    id="email-input"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="yourname@domain.com"
                                    className="w-full bg-slate-950/30 border border-slate-800/80 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 transition-all"
                                />
                            </div>
                        </div>

                        {/* Phone Input (only registration) */}
                        {!isLogin && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1.5">Phone Number</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                                        <Phone size={18} />
                                    </span>
                                    <input
                                        id="phone-input"
                                        type="tel"
                                        required
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+1 (555) 000-0000"
                                        className="w-full bg-slate-950/30 border border-slate-800/80 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 transition-all"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* Password Input */}
                        <div>
                            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1.5">Password</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                                    <Lock size={18} />
                                </span>
                                <input
                                    id="password-input"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-950/30 border border-slate-800/80 rounded-xl py-2.5 pl-10 pr-10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <motion.button
                            id="submit-auth-btn"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 mt-6 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </motion.button>
                    </form>

                    {/* Switch Toggles */}
                    <div className="text-center mt-6 pt-6 border-t border-slate-800/40">
                        <button
                            id="toggle-auth-mode"
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-slate-400 hover:text-blue-400 text-sm font-medium transition-colors"
                        >
                            {isLogin 
                                ? "Don't have an account? Sign Up" 
                                : 'Already have an account? Sign In'}
                        </button>
                    </div>

                </div>
            </motion.div>
        </div>
    );
}
