import React, { useState, useEffect, useRef } from "react";
import { subscribeToRecentRegistrations } from "../../../lib/db";
import { Sparkles, Trophy } from "lucide-react";

// --- Particle Class for Confetti Cannon ---
class ConfettiParticle {
  constructor(x, y, angle, velocity, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 8 + 6;
    const rad = (angle * Math.PI) / 180;
    this.vx = Math.cos(rad) * velocity * (0.6 + Math.random() * 0.8);
    this.vy = Math.sin(rad) * velocity * (0.6 + Math.random() * 0.8);
    this.color = color;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = Math.random() * 12 - 6;
    this.opacity = 1;
    this.gravity = 0.28;
    this.friction = 0.98;
    this.shape = Math.random() > 0.5 ? "square" : "circle";
  }

  update(height) {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    
    // Slow fade out as it descends
    if (this.y > height * 0.3) {
      this.opacity -= 0.012;
    }
  }

  draw(ctx) {
    if (this.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;

    if (this.shape === "square") {
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export default function CelebrationFeed() {
  const [activeCelebration, setActiveCelebration] = useState(null);
  const celebratedIds = useRef(new Set());
  const initialMountTime = useRef(Date.now());
  const queue = useRef([]);
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const animationFrameId = useRef(null);

  // --- Confetti Loop Logic ---
  const triggerConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#FF2E93", "#FF8A00", "#FF007A", "#FFC700", "#00F0FF", "#9E00FF", "#00FF66"];
    particles.current = [];

    // Left Cannon (fires up and right)
    for (let i = 0; i < 60; i++) {
      particles.current.push(
        new ConfettiParticle(
          0,
          canvas.height,
          -45 + (Math.random() * 20 - 10), // Angle around -45 deg
          Math.random() * 15 + 15,         // Velocity
          colors[Math.floor(Math.random() * colors.length)]
        )
      );
    }

    // Right Cannon (fires up and left)
    for (let i = 0; i < 60; i++) {
      particles.current.push(
        new ConfettiParticle(
          canvas.width,
          canvas.height,
          -135 + (Math.random() * 20 - 10), // Angle around -135 deg
          Math.random() * 15 + 15,          // Velocity
          colors[Math.floor(Math.random() * colors.length)]
        )
      );
    }

    // Cancel existing loop if running
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((p, idx) => {
        p.update(canvas.height);
        p.draw(ctx);
      });

      // Filter out dead particles
      particles.current = particles.current.filter((p) => p.opacity > 0);

      if (particles.current.length > 0) {
        animationFrameId.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    tick();
  };

  // Resize canvas handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  // --- Real-time listener for registrations ---
  const isFirstSnapshot = useRef(true);

  useEffect(() => {
    const unsub = subscribeToRecentRegistrations((list) => {
      if (isFirstSnapshot.current) {
        list.forEach((reg) => {
          celebratedIds.current.add(reg.id);
        });
        isFirstSnapshot.current = false;
        return;
      }

      list.forEach((reg) => {
        if (!celebratedIds.current.has(reg.id)) {
          celebratedIds.current.add(reg.id);
          queue.current.push(reg);
        }
      });

      processQueue();
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const processQueue = () => {
    if (activeCelebration || queue.current.length === 0) return;

    const nextReg = queue.current.shift();
    setActiveCelebration(nextReg);
    triggerConfetti();

    // Hide banner after 6.5 seconds and trigger next in queue
    setTimeout(() => {
      setActiveCelebration(null);
      // Wait a tiny bit before starting the next one for visual spacing
      setTimeout(() => {
        processQueue();
      }, 500);
    }, 6500);
  };

  // Extract variables safely for the active banner if present
  const nameKey = activeCelebration
    ? Object.keys(activeCelebration).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase())) || "Name"
    : "Name";
  const leadName = activeCelebration ? activeCelebration[nameKey] || "Someone" : "Someone";
  const attender = activeCelebration ? activeCelebration.convertedBy || "An Attender" : "An Attender";
  const program = activeCelebration ? activeCelebration["Called For"] || activeCelebration.calledFor || activeCelebration.programName || "the Program" : "the Program";

  return (
    <>
      {/* Dynamic Celebration Canvas (Always mounted to prevent React ref race conditions) */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none w-full h-full" style={{ zIndex: 999999 }} />

      {/* Floating Glassmorphism Notification Banner */}
      {activeCelebration && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md animate-slide-in select-none" style={{ zIndex: 999999 }}>
          <div className="relative overflow-hidden bg-white/95 backdrop-blur-xl border border-blue-100 shadow-[0_20px_50px_rgba(59,_130,_246,_0.18)] rounded-3xl p-5 flex items-center gap-4 transition-all duration-500">
            
            {/* Neon side border/glow */}
            <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-b from-blue-500 via-indigo-500 to-indigo-600" />
            
            {/* Animated Glow Dot */}
            <div className="absolute top-1/2 right-4 transform -translate-y-1/2 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />

            {/* Icon Badge */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0 animate-bounce">
              <Trophy size={20} className="stroke-[2.5]" />
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 font-mono">Success Milestone</span>
                <Sparkles size={12} className="text-amber-500 animate-pulse" />
              </div>
              <p className="text-slate-800 font-bold text-sm mt-1 leading-snug">
                <span className="text-blue-600 font-black">{attender}</span> registered <span className="text-amber-500 font-black">{leadName}</span>!
              </p>
              <p className="text-slate-500 font-medium text-xs mt-0.5 truncate">
                Registered For: <span className="text-emerald-600 font-bold">{program}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Slide-in and glow animation stylesheet injection */}
      <style>{`
        @keyframes slideIn {
          0% {
            transform: translate(-50%, -100px) scale(0.9);
            opacity: 0;
          }
          15% {
            transform: translate(-50%, 0) scale(1.03);
            opacity: 1;
          }
          20% {
            transform: translate(-50%, 0) scale(1);
          }
          85% {
            transform: translate(-50%, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -120px) scale(0.95);
            opacity: 0;
          }
        }
        .animate-slide-in {
          animation: slideIn 6.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
}
