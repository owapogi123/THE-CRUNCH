"use client";

import { useState, useEffect, useRef } from "react";
import {
  Clock,
  Menu as MenuIcon,
  Bell,
  ClipboardList,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";

interface OrderItem {
  quantity: number;
  name: string;
}

interface OrderCard {
  id: string;
  orderNumber: string;
  tableNumber: number;
  status: "dine-in" | "take-out" | "delivery";
  orderType: "dine-in" | "take-out" | "delivery";
  items: OrderItem[];
  isPreparing: boolean;
  isReady: boolean;
  isFinished: boolean;
  startedAt?: number;
}

const COOK_TIME_SECONDS = 10 * 60;

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const times = [0, 0.25, 0.5];
    times.forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + offset + 0.2,
      );
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {
    // AudioContext not available (e.g. SSR), silently ignore
  }
}

function OrderTimer({
  startedAt,
  orderNumber,
}: {
  startedAt: number;
  orderNumber: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const notifiedRef = useRef(false);
  const soundRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(secs);

      if (secs >= COOK_TIME_SECONDS) {
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          if (Notification.permission === "granted") {
            new Notification("🍗 Order Ready!", {
              body: `Order ${orderNumber} is done and ready to serve!`,
              icon: "/favicon.ico",
            });
          }
        }
        if (!soundRef.current) {
          soundRef.current = true;
          playAlertSound();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, orderNumber]);

  const remaining = COOK_TIME_SECONDS - elapsed;
  const isOverdue = remaining <= 0;
  const displaySeconds = isOverdue ? Math.abs(remaining) : remaining;
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div
      className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold mb-3 ${
        isOverdue
          ? "bg-red-100 text-red-600 animate-pulse"
          : elapsed > COOK_TIME_SECONDS * 0.75
            ? "bg-yellow-100 text-yellow-700"
            : "bg-green-100 text-green-700"
      }`}
    >
      <Clock className="w-3 h-3" />
      {isOverdue ? `OVERDUE +${timeStr}` : timeStr}
    </div>
  );
}

export default function Order() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifPermission, setNotifPermission] = useState(
    Notification.permission,
  );
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [servedCount, setServedCount] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [queueRows, allRows] = await Promise.all([
        api.get<OrderCard[]>("/orders/queue"),
        api.get<{ id?: number | string; orderId?: number | string; status: string }[]>("/orders"),
      ]);

      const activeOrders = (queueRows ?? []).filter((o) => !o.isFinished);
      setOrders(activeOrders);

      const completedIds = new Set(
        (allRows ?? [])
          .filter((o) => o.status === "Completed")
          .map((o) => String(o.id ?? o.orderId)),
      );
      setServedCount(completedIds.size);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, []);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStart = async (id: string) => {
    try {
      await api.patch(`/orders/${id}`, {
        status: "preparing",
        startedAt: new Date().toISOString(),
      });
      fetchAll();
    } catch (err) {
      console.error("Failed to start order:", err);
    }
  };

  const handleReady = async (id: string) => {
    try {
      await api.patch(`/orders/${id}`, { status: "ready" });
      fetchAll();
    } catch (err) {
      console.error("Failed to mark order ready:", err);
    }
  };

  const handleFinish = async (id: string) => {
    try {
      await api.patch(`/orders/${id}`, { status: "Completed" });
      fetchAll();
    } catch (err) {
      console.error("Failed to finish order:", err);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.patch(`/orders/${id}`, { status: "Cancelled" });
      fetchAll();
    } catch (err) {
      console.error("Failed to cancel order:", err);
    } finally {
      setCancellingId(null);
    }
  };

  const formatDateTime = (date: Date) => {
    const days = [
      "Sunday", "Monday", "Tuesday", "Wednesday",
      "Thursday", "Friday", "Saturday",
    ];
    const dayName = days[date.getDay()];
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${dayName}, ${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status: string) => {
    if (status === "dine-in") return "bg-red-600 text-white";
    if (status === "take-out") return "bg-amber-600 text-white";
    return "bg-blue-600 text-white";
  };

  const getStatusLabel = (status: string) => {
    if (status === "dine-in") return "Dine In";
    if (status === "take-out") return "Take Out";
    return "Delivery";
  };

  const newCount = orders.filter((o) => !o.isPreparing && !o.isReady).length;
  const processCount = orders.filter((o) => o.isPreparing && !o.isReady).length;
  const readyCount = orders.filter((o) => o.isReady).length;

  return (
    <div
      className="min-h-screen bg-white"
      style={{ fontFamily: "Poppins, sans-serif" }}
    >
      <Sidebar />

      <div className="p-6 pl-24">
        {/* Stats Row */}
        <div className="flex gap-6 items-start mb-6">
          <div className="bg-white rounded-2xl p-6 flex-1 max-w-sm shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <MenuIcon className="w-5 h-5 text-gray-900" />
              <span className="text-xs font-semibold text-gray-500">
                COOK VIEW
              </span>
            </div>
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDateTime(currentTime)}
            </p>
          </div>

          <div className="flex gap-4 flex-1">
            <div className="bg-red-700 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">NEW</span>
              <span className="text-white text-3xl font-bold">{newCount}</span>
            </div>
            <div className="bg-green-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">READY</span>
              <span className="text-white text-3xl font-bold">{readyCount}</span>
            </div>
            <div className="bg-yellow-400 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-gray-900 text-sm font-semibold mb-3">PROCESS</span>
              <span className="text-gray-900 text-3xl font-bold">{processCount}</span>
            </div>
            <div className="bg-gray-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">SERVED</span>
              <span className="text-white text-3xl font-bold">{servedCount}</span>
            </div>
          </div>
        </div>

        {/* Notification banner */}
        {notifPermission !== "granted" && (
          <div className="mb-4">
            <button
              onClick={() =>
                Notification.requestPermission().then((p) =>
                  setNotifPermission(p),
                )
              }
              className="flex items-center gap-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition"
            >
              <Bell className="w-3 h-3" />
              Enable notifications for order alerts
            </button>
          </div>
        )}

        {/* Queue Header */}
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-semibold text-gray-700">Order Queue</span>
          {orders.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {orders.length}
            </span>
          )}
        </div>

        {/* Order Queue */}
        <div className="bg-gray-100 rounded-3xl p-4 shadow-sm">
          {orders.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-gray-400 text-sm">
                No pending orders. Orders from the cashier will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {orders.map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                      },
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.8,
                      y: -20,
                      transition: { duration: 0.3 },
                    }}
                    whileHover={{
                      scale: 1.02,
                      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
                    }}
                    className={`bg-white rounded-2xl p-5 shadow-md border-2 transition-colors ${
                      order.isReady
                        ? "border-green-400"
                        : order.isPreparing
                          ? "border-yellow-300"
                          : "border-transparent"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-xs text-gray-400 mt-0.5">
                        {order.orderNumber}
                      </p>
                      <span
                        className={`${getStatusColor(order.status)} text-xs font-bold px-3 py-1 rounded-full`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    {/* Timer */}
                    {order.isPreparing && order.startedAt && (
                      <OrderTimer
                        startedAt={order.startedAt}
                        orderNumber={order.orderNumber}
                      />
                    )}

                    {order.isReady && (
                      <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold mb-3 bg-green-100 text-green-700">
                        Ready to serve
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-2 mb-6 border-b border-gray-200 pb-4">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm text-gray-700"
                        >
                          <span className="font-semibold">{item.quantity}x</span>
                          <span className="text-gray-600">{item.name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-col">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!order.isPreparing && !order.isReady) {
                              handleStart(order.id);
                            }
                          }}
                          className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
                            order.isPreparing || order.isReady
                              ? "bg-white text-gray-400 shadow-md opacity-50 cursor-not-allowed"
                              : "bg-white text-gray-900 shadow-md hover:shadow-lg cursor-pointer"
                          }`}
                        >
                          START
                        </button>
                        {!order.isReady ? (
                          <button
                            onClick={() => {
                              if (order.isPreparing) {
                                handleReady(order.id);
                              }
                            }}
                            className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
                              order.isPreparing
                                ? "bg-yellow-400 text-gray-900 hover:bg-yellow-500 hover:shadow-lg cursor-pointer"
                                : "bg-yellow-400 text-gray-900 opacity-50 cursor-not-allowed"
                            }`}
                          >
                            READY
                          </button>
                        ) : (
                          <button
                            onClick={() => handleFinish(order.id)}
                            className="flex-1 py-2 px-3 rounded-lg font-bold text-xs bg-green-600 text-white hover:bg-green-700 hover:shadow-lg transition-all duration-200 cursor-pointer"
                          >
                            SERVED
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (cancellingId !== order.id && !order.isReady) {
                            handleCancel(order.id);
                          }
                        }}
                        className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 ${
                          cancellingId === order.id || order.isReady
                            ? "bg-red-50 text-red-300 cursor-not-allowed opacity-50"
                            : "bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 cursor-pointer"
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        {cancellingId === order.id ? "Cancelling..." : "CANCEL"}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}