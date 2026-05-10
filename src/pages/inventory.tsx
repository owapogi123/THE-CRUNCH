"use client";

import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Sidebar } from "@/components/Sidebar";
import { api, apiCall, resolveAssetUrl } from "@/lib/api";
import { motion } from "framer-motion";
import { useNotifications } from "@/lib/NotificationContext";

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Real-time clock hook ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const formatPeso = (value: number | string) =>
  `\u20B1${Number(value || 0).toLocaleString()}`;

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Types ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

interface ApiInventoryRow {
  id?: number;
  product_id?: number;
  inventory_id?: number;
  item_type?: string;
  menu_code?: string;
  name?: string;
  product_name?: string;
  category?: string;
  image?: string;
  stock?: number;
  quantity?: number;
  price?: number | string;
  unit?: string;
  promo?: string;
  isRawMaterial?: number | boolean;
  description?: string;
  availability_status?: string;
  is_promotional?: number | boolean;
  promo_price?: number | string | null;
  promo_label?: string;
  dailyWithdrawn?: number;
  returned?: number;
  wasted?: number;
  soldToday?: number;
  manual_override?: number | boolean;
  manual_status?: string;
  ingredient_count?: number;
  available_servings?: number | string | null;
  ingredients?: MenuIngredientRow[];
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Constants ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Notification helper ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function notify(
  addNotification: ReturnType<typeof useNotifications>["addNotification"],
  label: string,
  type: "success" | "error" | "warning" | "info" = "info",
) {
  addNotification({ id: `${Date.now()}-${Math.random()}`, label, type });
}

async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await api.post<{ fileUrl: string }>(
    "/upload-product-image",
    formData,
  );
  const fileUrl = String(response?.fileUrl ?? "").trim();
  if (!fileUrl) {
    throw new Error("Product image upload did not return a file path");
  }
  return fileUrl;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Shared UI ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function SMModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 backdrop-blur-sm"
      style={{
        background: "rgba(17,24,39,0.28)",
        animation: "fadeIn 0.18s ease",
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[480px] overflow-hidden"
        style={{
          boxShadow: "0 20px 60px rgba(0,0,0,0.1)",
          animation: "slideUp 0.22s cubic-bezier(.4,0,.2,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-[22px] py-[17px] border-b border-gray-50">
          <span className="font-bold text-[14px] text-gray-900">{title}</span>
          <button
            onClick={onClose}
            className="text-gray-400 text-[20px] leading-none px-[5px] py-[2px] rounded-[5px] hover:bg-gray-100 hover:text-gray-700 transition-all bg-transparent border-none cursor-pointer"
          >
            {"\u00D7"}
          </button>
        </div>
        <div className="px-[22px] py-5 max-h-[58vh] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 px-[22px] py-3 border-t border-gray-50 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

function FormGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[14px]">
      <label className="block text-[11px] font-bold text-gray-500 mb-[5px] uppercase tracking-[0.5px]">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full px-[11px] py-2 border-[1.5px] border-gray-200 rounded-lg text-[12.5px] font-[Poppins,sans-serif] text-gray-900 outline-none bg-white transition-all focus:border-gray-400 focus:shadow-[0_0_0_3px_rgba(107,114,128,0.08)] box-border";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}
function FormInput({ label, ...rest }: FormInputProps) {
  return (
    <FormGroup label={label}>
      <input className={inputClass} {...rest} />
    </FormGroup>
  );
}

function SectionHeader({
  title,
  sub,
  cta,
}: {
  title: string;
  sub: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-end mb-[14px]">
      <div>
        <div className="text-[13.5px] font-bold text-gray-900">{title}</div>
        <div className="text-[11.5px] text-gray-400 mt-[1px]">{sub}</div>
      </div>
      {cta}
    </div>
  );
}

function DataTable({
  cols,
  rows,
  emptyHint,
}: {
  cols: string[];
  rows: React.ReactNode[];
  emptyHint: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-[1.5px] border-gray-50">
            {cols.map((c) => (
              <th
                key={c}
                className="px-[14px] py-[10px] text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-[0.6px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length}>
                <div className="text-center py-[42px]">
                  <div className="text-[13px] text-gray-400">
                    No records yet
                  </div>
                  <div className="text-[11px] text-gray-300 mt-[3px]">
                    {emptyHint}
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  meta,
  color,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  meta?: string;
  color: "blue" | "green" | "yellow" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const colorMap = {
    green: { border: "#16a34a", text: "#16a34a" },
    yellow: { border: "#ca8a04", text: "#ca8a04" },
    red: { border: "#dc2626", text: "#dc2626" },
    blue: { border: "#4f46e5", text: "#4f46e5" },
  };
  const c = colorMap[color];
  return (
    <div
      className={`bg-white rounded-xl px-[18px] py-[15px] border transition-all ${
        onClick
          ? "cursor-pointer select-none hover:shadow-md"
          : "hover:shadow-md"
      } ${active ? "shadow-md ring-2" : "border-gray-100"}`}
      style={{
        borderTop: `3px solid ${c.border}`,
        outline: active ? `2px solid ${c.border}` : undefined,
        outlineOffset: active ? "2px" : undefined,
      }}
      onClick={onClick}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.6px] mb-[7px]"
        style={{ color: c.text }}
      >
        {label}
      </div>
      <div
        className="text-[24px] font-extrabold leading-none"
        style={{ color: c.text }}
      >
        {value}
      </div>
      {meta && <div className="text-[11px] mt-1 text-gray-400">{meta}</div>}
    </div>
  );
}

const ghostBtnClass =
  "bg-gray-100 text-gray-700 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity";
const dangerBtnClass =
  "bg-red-50 text-red-600 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity";
const primaryBtnClass =
  "bg-white text-gray-700 border border-gray-200 cursor-pointer font-[Poppins,sans-serif] font-semibold text-[12.5px] rounded-[9px] px-[18px] py-2 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900 transition-all";

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Menu Management Tab ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

interface MgmtProduct {
  id: number;
  rawProductId?: number;
  rawInventoryId?: number;
  menuCode: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  stock: number;
  description?: string;
  image?: string;
  availabilityStatus: string;
  manualOverride: boolean;
  manualStatus: string;
  overrideMode: ManualOverrideMode;
  availableServings?: number | null;
  isPromotional: boolean;
  promoPrice?: string;
  promoLabel?: string;
  ingredients: MenuIngredientInput[];
}

interface MenuIngredientRow {
  product_id?: number;
  product_name?: string;
  quantity_required?: number | string;
  unit?: string;
  daily_withdrawn?: number | string;
  stock?: number | string;
}

interface MenuIngredientInput {
  productId: string;
  quantityRequired: string;
  productName?: string;
  unit?: string;
  stock?: number;
}

interface IngredientOption {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
}

interface MenuCategoryRecord {
  category_id: number;
  name: string;
  display_order: number;
  is_active: boolean | number;
}

type ManualOverrideMode =
  | "Auto"
  | "Force Available"
  | "Force Out of Stock";

const UNIT_OPTIONS = [
  "piece",
  "kg",
  "g",
  "liter",
  "ml",
  "bottle",
  "box",
] as const;
const OVERRIDE_MODE_OPTIONS: ManualOverrideMode[] = [
  "Auto",
  "Force Available",
  "Force Out of Stock",
];

async function tryPut(endpoints: string[], payload: object): Promise<void> {
  let lastErr: unknown;
  for (const ep of endpoints) {
    try {
      await apiCall(ep, {
        method: "PUT",
        body: payload,
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/*
function MenuManagementTab() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<MgmtProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<MgmtProduct | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCat, setFCat] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fUnit, setFUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [fDesc, setFDesc] = useState("");
  const [fAvailabilityStatus, setFAvailabilityStatus] = useState<string>(
    AVAILABILITY_OPTIONS[0],
  );
  const [fIsPromotional, setFIsPromotional] = useState(false);
  const [fPromoPrice, setFPromoPrice] = useState("");
  const [fPromoLabel, setFPromoLabel] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState<string>("");

  const [eName, setEName] = useState("");
  const [eCat, setECat] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eUnit, setEUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [eStock, setEStock] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eAvailabilityStatus, setEAvailabilityStatus] = useState<string>(
    AVAILABILITY_OPTIONS[0],
  );
  const [eIsPromotional, setEIsPromotional] = useState(false);
  const [ePromoPrice, setEPromoPrice] = useState("");
  const [ePromoLabel, setEPromoLabel] = useState("");
  const [eImageFile, setEImageFile] = useState<File | null>(null);
  const [eImagePreview, setEImagePreview] = useState<string>("");

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Image helpers
  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function handleFImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFImageFile(file);
    setFImagePreview(URL.createObjectURL(file));
  }
  function handleEImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEImageFile(file);
    setEImagePreview(URL.createObjectURL(file));
  }

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = (await apiCall("/inventory", { method: "GET" })) as
        | ApiInventoryRow[]
        | null;
      if (data && Array.isArray(data)) {
        const rows = data.filter(
          (item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item",
        );

        const groupedByName = new Map<string, ApiInventoryRow[]>();
        for (const item of rows) {
          const key = String(item?.product_name ?? item?.name ?? "").trim().toLowerCase();
          const group = groupedByName.get(key) ?? [];
          group.push(item);
          groupedByName.set(key, group);
        }

        const normalized = Array.from(groupedByName.values()).map((group) =>
          group.reduce((latest, current) => {
            const latestId = Number(latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0);
            const currentId = Number(current?.product_id ?? current?.id ?? current?.inventory_id ?? 0);
            return currentId > latestId ? current : latest;
          }),
        );

        setProducts(
          normalized.map((item) => ({
            id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
            rawProductId: item.product_id ? Number(item.product_id) : undefined,
            rawInventoryId: item.inventory_id ? Number(item.inventory_id) : undefined,
            menuCode: String((item as any).menu_code ?? `M-${String(item.product_id ?? item.id ?? item.inventory_id ?? 0).padStart(3, "0")}`),
            name: item.name || item.product_name || "Unnamed Product",
            category: item.category || "Uncategorized",
            price: String(item.price ?? "0"),
            unit: String(item.unit ?? "piece"),
            stock: Number((item as any).quantity ?? (item as any).stock ?? 0),
            description: String((item as any).description ?? ""),
            image: item.image || "/img/placeholder.jpg",
            availabilityStatus: String(
              (item as any).availability_status ?? "Available",
            ),
            isPromotional: Boolean(Number((item as any).is_promotional ?? 0)),
            promoPrice:
              (item as any).promo_price !== null &&
              (item as any).promo_price !== undefined &&
              String((item as any).promo_price) !== ""
                ? String((item as any).promo_price)
                : "",
            promoLabel: String((item as any).promo_label ?? ""),
          })),
        );
      }
    } catch (error) {
      console.error("Failed to load products:", error);
      notify(addNotification, "Failed to load products. Please try refreshing.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  function resetAddForm() {
    setFName(""); setFCat(""); setFPrice("");
    setFDesc("");
    setFAvailabilityStatus(AVAILABILITY_OPTIONS[0]);
    setFIsPromotional(false);
    setFPromoPrice("");
    setFPromoLabel("");
    setFImageFile(null); setFImagePreview("");
  }

  function openEdit(p: MgmtProduct) {
    setEditProduct(p);
    setEName(p.name); setECat(p.category); setEPrice(p.price);
    setEStock(String(p.stock)); setEDesc(p.description ?? "");
    setEAvailabilityStatus(p.availabilityStatus || "Available");
    setEIsPromotional(Boolean(p.isPromotional));
    setEPromoPrice(p.promoPrice ?? "");
    setEPromoLabel(p.promoLabel ?? "");
    setEImageFile(null);
    setEImagePreview(p.image && p.image !== "/img/placeholder.jpg" ? p.image : "");
  }

  async function handleAdd() {
    if (!fName.trim() || !fCat.trim() || !fPrice.trim()) {
      notify(addNotification, "Please fill in Name, Category, and Price.", "warning");
      return;
    }
    try {
      setSaving(true);
      let imageUrl = "/img/placeholder.jpg";
      if (fImageFile) {
        imageUrl = await toBase64(fImageFile);
      }
      await api.post("/products", {
        name: fName.trim(), category: fCat.trim(),
        price: parseFloat(fPrice), unit: UNIT_OPTIONS[0],
        quantity: 0,
        description: fDesc.trim() || null,
        image: imageUrl,
        availability_status: fAvailabilityStatus,
        is_promotional: fIsPromotional,
        promo_price: fIsPromotional && fPromoPrice.trim() ? parseFloat(fPromoPrice) : null,
        promo_label: fIsPromotional ? fPromoLabel.trim() || null : null,
      });
      await loadProducts();
      setShowAdd(false);
      resetAddForm();
      notify(addNotification, `"${fName.trim()}" added successfully.`, "success");
    } catch (error) {
      notify(addNotification, `Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editProduct) return;
    if (!eName.trim() || !eCat.trim() || !ePrice.trim()) {
      notify(addNotification, "Please fill in Name, Category, and Price.", "warning");
      return;
    }
    try {
      setSaving(true);
      let editImageUrl: string | undefined;
      if (eImageFile) {
        editImageUrl = await toBase64(eImageFile);
      } else if (eImagePreview && eImagePreview !== "/img/placeholder.jpg") {
        editImageUrl = eImagePreview;
      }
      const payload: Record<string, unknown> = {
        name: eName.trim(), category: eCat.trim(),
        price: parseFloat(ePrice), unit: editProduct.unit || UNIT_OPTIONS[0],
        quantity: parseFloat(eStock) || 0,
        description: eDesc.trim() || null,
        availability_status: eAvailabilityStatus,
        is_promotional: eIsPromotional,
        promo_price: eIsPromotional && ePromoPrice.trim() ? parseFloat(ePromoPrice) : null,
        promo_label: eIsPromotional ? ePromoLabel.trim() || null : null,
      };
      if (editImageUrl) payload.image = editImageUrl;
      const endpointsToTry: string[] = [];
      const pid = editProduct.rawProductId ?? editProduct.id;
      const iid = editProduct.rawInventoryId;
      endpointsToTry.push(`/products/${pid}`);
      if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
      endpointsToTry.push(`/inventory/${pid}`);
      if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
      await tryPut(endpointsToTry, payload);
      await loadProducts();
      notify(addNotification, `"${eName.trim()}" updated successfully.`, "success");
      setEditProduct(null);
    } catch (error) {
      notify(addNotification, `Failed to update: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const product = products.find((p) => p.id === id);
    const endpointsToTry: string[] = [];
    const pid = product?.rawProductId ?? id;
    const iid = product?.rawInventoryId;
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
    try {
      setSaving(true);
      let lastErr: unknown;
      let deleted = false;
      for (const ep of endpointsToTry) {
        try {
          await apiCall(ep, { method: "DELETE" });
          deleted = true; break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
          lastErr = err;
        }
      }
      if (!deleted) throw lastErr;
      await loadProducts();
      setDeleteId(null);
      notify(addNotification, "Product deleted successfully.", "success");
    } catch (error) {
      notify(addNotification, `Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleStockUpdate(id: number, delta: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    const payload = { quantity: newStock };
    const pid = product.rawProductId ?? id;
    const iid = product.rawInventoryId;
    const endpointsToTry: string[] = [];
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
    try {
      await tryPut(endpointsToTry, payload);
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: newStock } : p)));
    } catch (error) {
      notify(addNotification, `Failed to update stock: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  }

  async function handleAvailabilityToggle(product: MgmtProduct) {
    const nextStatus =
      product.availabilityStatus === "Hidden" ? "Available" : "Hidden";
    try {
      await tryPut([`/products/${product.rawProductId ?? product.id}`], {
        availability_status: nextStatus,
      });
      setProducts((prev) =>
        prev.map((entry) =>
          entry.id === product.id
            ? { ...entry, availabilityStatus: nextStatus }
            : entry,
        ),
      );
      notify(
        addNotification,
        `"${product.name}" is now ${nextStatus}.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update availability: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  const filtered = products.filter((p) => {
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      p.menuCode.toLowerCase().includes(s) ||
      String(p.promoLabel ?? "").toLowerCase().includes(s)
    );
  });

  const totalValue = products.reduce((sum, p) => {
    const price = parseFloat(String(p.price).replace(/[^0-9.]/g, "")) || 0;
    return sum + price * p.stock;
  }, 0);

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 10).length;
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const hiddenCount = products.filter((p) => p.availabilityStatus === "Hidden").length;
  const promoCount = products.filter((p) => p.isPromotional).length;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Menu Administration</p>
        <h2 className="text-xl font-bold text-gray-900">Menu Management</h2>
        <p className="text-gray-500 text-sm mt-1">Create, update, and maintain menu items, pricing, descriptions, images, units, and stock details.</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Menu Items" value={products.length} meta="In system" color="blue" />
        <StatCard label="Total Value" value={formatPeso(totalValue)} meta="Stock value" color="green" />
        <StatCard label="Low Stock" value={lowStock} meta={"\u2264 10 units"} color="yellow" />
        <StatCard label="Out of Stock" value={outOfStock} meta="Zero stock" color="red" />
      </div>

      <SectionHeader
        title="Menu Item List"
        sub="All menu and product records synced from your backend"
        cta={
          <div className="flex gap-2">
            <button className={primaryBtnClass} onClick={() => void loadProducts()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button className={primaryBtnClass} onClick={() => setShowAdd(true)}>+ Add Menu Item</button>
          </div>
        }
      />

      <div className="mb-[14px]">
        <input
          className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
          placeholder="Search by name or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <motion.div
            className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-500"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <p className="text-gray-400 text-sm">Loading products...</p>
        </div>
      ) : (
        <DataTable
          cols={["Product", "Category", "Price", "Unit", "Stock", "Actions"]}
          emptyHint="No menu items found. Try refreshing or add a new product."
          rows={filtered.map((p) => {
            const stockColor =
              p.stock === 0 ? "text-red-600 font-bold"
              : p.stock <= 10 ? "text-yellow-600 font-bold"
              : "text-gray-900 font-semibold";
            return (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
                <td className="px-[14px] py-[11px]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image && p.image !== "/img/placeholder.jpg" ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-[10px] font-bold">{p.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[12.5px] font-semibold text-gray-900">{p.name}</div>
                      {p.description && (
                        <div className="text-[11px] text-gray-400 max-w-[180px] truncate">{p.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-[14px] py-[11px]">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">{p.category}</span>
                </td>
                <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">
                  {formatPeso(parseFloat(String(p.price).replace(/[^0-9.]/g, "")))}
                </td>
                <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">{p.unit}</td>
                <td className="px-[14px] py-[11px]">
                  <div className="flex items-center gap-2">
                    <button onClick={() => void handleStockUpdate(p.id, -1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 text-[14px] font-bold flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors border-none cursor-pointer leading-none">{"\u2212"}</button>
                    <span className={`min-w-[36px] text-center text-[12.5px] ${stockColor}`}>{p.stock}</span>
                    <button onClick={() => void handleStockUpdate(p.id, 1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 text-[14px] font-bold flex items-center justify-center hover:bg-green-50 hover:text-green-600 transition-colors border-none cursor-pointer leading-none">+</button>
                    {p.stock === 0 && <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Out</span>}
                    {p.stock > 0 && p.stock <= 10 && <span className="text-[10px] font-semibold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">Low</span>}
                  </div>
                </td>
                <td className="px-[14px] py-[11px]">
                  <div className="flex gap-[5px]">
                    <button className={ghostBtnClass} onClick={() => openEdit(p)}>Edit</button>
                    <button className={dangerBtnClass} onClick={() => setDeleteId(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        />
      )}

      {showAdd && (
        <SMModal title="Add Menu Item" onClose={() => { setShowAdd(false); resetAddForm(); }}
          footer={<>
            <button className={ghostBtnClass} onClick={() => { setShowAdd(false); resetAddForm(); }} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} onClick={() => void handleAdd()} disabled={saving}>{saving ? "Saving..." : "Add Menu Item"}</button>
          </>}
        >
          <FormInput label="Menu Item Name *" placeholder="e.g. Chicken Breast" value={fName} onChange={(e) => setFName(e.target.value)} />
          <FormInput label="Category *" placeholder="e.g. Ingredients" value={fCat} onChange={(e) => setFCat(e.target.value)} />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput label={`Price (${formatPeso(0).slice(0, 1)}) *`} type="number" placeholder="0.00" value={fPrice} onChange={(e) => setFPrice(e.target.value)} />
            <FormGroup label="Unit"><select className={inputClass} value={fUnit} onChange={(e) => setFUnit(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select></FormGroup>
          </div>
          <FormGroup label="Description (optional)"><textarea className={`${inputClass} resize-none`} rows={2} placeholder="Brief description..." value={fDesc} onChange={(e) => setFDesc(e.target.value)} /></FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden" style={{minHeight: fImagePreview ? "auto" : "80px"}}>
              {fImagePreview ? (
                <div className="relative w-full">
                  <img src={fImagePreview} alt="Preview" className="w-full h-[120px] object-cover" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 hover:opacity-100 text-white text-[11px] font-semibold bg-black/50 px-2 py-1 rounded-md transition-opacity">Change image</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[11px] text-gray-400 font-medium">Click to upload image</span>
                  <span className="text-[10px] text-gray-300">PNG, JPG up to 5MB</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleFImageChange} />
            </label>
            {fImagePreview && (
              <button type="button" className="mt-[6px] text-[11px] text-red-400 hover:text-red-600 font-semibold bg-transparent border-none cursor-pointer font-[Poppins,sans-serif]" onClick={() => { setFImageFile(null); setFImagePreview(""); }}>
                Remove image
              </button>
            )}
          </FormGroup>
        </SMModal>
      )}

      {editProduct && (
        <SMModal title={`Edit Menu Item \u2014 ${editProduct.name}`} onClose={() => setEditProduct(null)}
          footer={<>
            <button className={ghostBtnClass} onClick={() => setEditProduct(null)} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} onClick={() => void handleEdit()} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
          </>}
        >
          <FormInput label="Menu Item Name *" placeholder="e.g. Chicken Breast" value={eName} onChange={(e) => setEName(e.target.value)} />
          <FormInput label="Category *" placeholder="e.g. Ingredients" value={eCat} onChange={(e) => setECat(e.target.value)} />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput label={`Price (${formatPeso(0).slice(0, 1)}) *`} type="number" placeholder="0.00" value={ePrice} onChange={(e) => setEPrice(e.target.value)} />
            <FormGroup label="Unit"><select className={inputClass} value={eUnit} onChange={(e) => setEUnit(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select></FormGroup>
          </div>
          <FormInput label="Stock Qty" type="number" placeholder="0" value={eStock} onChange={(e) => setEStock(e.target.value)} />
          <FormGroup label="Description (optional)"><textarea className={`${inputClass} resize-none`} rows={2} placeholder="Brief description..." value={eDesc} onChange={(e) => setEDesc(e.target.value)} /></FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden" style={{minHeight: eImagePreview ? "auto" : "80px"}}>
              {eImagePreview ? (
                <div className="relative w-full">
                  <img src={eImagePreview} alt="Preview" className="w-full h-[120px] object-cover" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 hover:opacity-100 text-white text-[11px] font-semibold bg-black/50 px-2 py-1 rounded-md transition-opacity">Change image</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[11px] text-gray-400 font-medium">Click to upload image</span>
                  <span className="text-[10px] text-gray-300">PNG, JPG up to 5MB</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleEImageChange} />
            </label>
            {eImagePreview && (
              <button type="button" className="mt-[6px] text-[11px] text-red-400 hover:text-red-600 font-semibold bg-transparent border-none cursor-pointer font-[Poppins,sans-serif]" onClick={() => { setEImageFile(null); setEImagePreview(""); }}>
                Remove image
              </button>
            )}
          </FormGroup>
        </SMModal>
      )}

      {deleteId !== null && (
        <SMModal title="Delete Menu Item" onClose={() => setDeleteId(null)}
          footer={<>
            <button className={ghostBtnClass} onClick={() => setDeleteId(null)} disabled={saving}>Cancel</button>
            <button className={dangerBtnClass} onClick={() => void handleDelete(deleteId!)} disabled={saving}>{saving ? "Deleting..." : "Yes, Delete"}</button>
          </>}
        >
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Are you sure you want to delete{" "}
            <span className="font-bold text-gray-900">{products.find((p) => p.id === deleteId)?.name ?? "this menu item"}</span>
            ? This action cannot be undone.
          </p>
        </SMModal>
      )}
    </div>
  );
}
*/

function MenuAdminTab() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<MgmtProduct[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRecord[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<MgmtProduct | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCat, setFCat] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fOverrideMode, setFOverrideMode] = useState<ManualOverrideMode>(
    OVERRIDE_MODE_OPTIONS[0],
  );
  const [fIngredients, setFIngredients] = useState<MenuIngredientInput[]>([]);
  const [fIsPromotional, setFIsPromotional] = useState(false);
  const [fPromoPrice, setFPromoPrice] = useState("");
  const [fPromoLabel, setFPromoLabel] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState("");

  const [eName, setEName] = useState("");
  const [eCat, setECat] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eStock, setEStock] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eOverrideMode, setEOverrideMode] = useState<ManualOverrideMode>(
    OVERRIDE_MODE_OPTIONS[0],
  );
  const [eIngredients, setEIngredients] = useState<MenuIngredientInput[]>([]);
  const [eIsPromotional, setEIsPromotional] = useState(false);
  const [ePromoPrice, setEPromoPrice] = useState("");
  const [ePromoLabel, setEPromoLabel] = useState("");
  const [eImageFile, setEImageFile] = useState<File | null>(null);
  const [eImagePreview, setEImagePreview] = useState("");

  const menuCategoryOptions = (() => {
    const apiOptions = menuCategories
      .filter((category) => category.is_active === true || category.is_active === 1)
      .sort(
        (a, b) =>
          Number(a.display_order ?? 0) - Number(b.display_order ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .map((category) => category.name.trim())
      .filter(Boolean);
    if (apiOptions.length > 0) return apiOptions;

    const fallback = new Set<string>([
      "Menu Food",
      "Beverages",
      "Desserts",
      "Combo Meals",
      "Snacks",
      "Promotional Items",
      ...products.map((product) => product.category).filter(Boolean),
      fCat.trim(),
      eCat.trim(),
    ]);
    return Array.from(fallback).filter(Boolean).sort((a, b) => a.localeCompare(b));
  })();

  function toOverrideMode(
    manualOverride: unknown,
    manualStatus: unknown,
  ): ManualOverrideMode {
    const isManual =
      manualOverride === true ||
      manualOverride === 1 ||
      String(manualOverride ?? "").trim().toLowerCase() === "true";
    if (!isManual) return "Auto";
    return String(manualStatus ?? "").trim().toLowerCase() === "out of stock"
      ? "Force Out of Stock"
      : "Force Available";
  }

  function toIngredientsInput(
    ingredients: MenuIngredientRow[] | undefined,
  ): MenuIngredientInput[] {
    return (ingredients ?? []).map((ingredient) => ({
      productId: String(ingredient.product_id ?? ""),
      quantityRequired: String(ingredient.quantity_required ?? ""),
      productName: ingredient.product_name,
      unit: ingredient.unit,
      stock: Number(ingredient.stock ?? 0),
    }));
  }

  function toOverridePayload(mode: ManualOverrideMode) {
    if (mode === "Force Available") {
      return { manual_override: true, manual_status: "Available" };
    }
    if (mode === "Force Out of Stock") {
      return { manual_override: true, manual_status: "Out of Stock" };
    }
    return { manual_override: false, manual_status: "Available" };
  }

  function buildIngredientPayload(inputs: MenuIngredientInput[]) {
    const sanitized = inputs
      .map((entry) => ({
        productId: entry.productId.trim(),
        quantityRequired: entry.quantityRequired.trim(),
      }))
      .filter(
        (entry) =>
          entry.productId.length > 0 || entry.quantityRequired.length > 0,
      );

    for (const entry of sanitized) {
      if (!entry.productId || !entry.quantityRequired) {
        throw new Error(
          "Each ingredient row needs both an ingredient and a required quantity.",
        );
      }
      if (Number(entry.quantityRequired) <= 0) {
        throw new Error("Ingredient quantities must be greater than zero.");
      }
    }

    return sanitized.map((entry) => ({
      product_id: Number(entry.productId),
      quantity_required: Number(entry.quantityRequired),
    }));
  }

  function addIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
  ) {
    setter((prev) => [...prev, { productId: "", quantityRequired: "" }]);
  }

  function updateIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
    index: number,
    field: "productId" | "quantityRequired",
    value: string,
  ) {
    setter((prev) =>
      prev.map((entry, rowIndex) =>
        rowIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function removeIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
    index: number,
  ) {
    setter((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  function renderOverrideButtons(
    value: ManualOverrideMode,
    onChange: (mode: ManualOverrideMode) => void,
  ) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {OVERRIDE_MODE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
              value === option
                ? "border-gray-800 bg-gray-800 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
            }`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function renderIngredientsEditor(
    value: MenuIngredientInput[],
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
  ) {
    return (
      <FormGroup label="Required Ingredients">
        <div className="space-y-2">
          {value.length === 0 && (
            <p className="text-[11px] text-gray-400">
              No ingredients assigned. This menu item will fall back to the
              existing stock-based availability.
            </p>
          )}
          {value.map((ingredient, index) => (
            <div key={`${ingredient.productId}-${index}`} className="grid grid-cols-3 gap-2">
              <select
                className={inputClass}
                value={ingredient.productId}
                onChange={(e) =>
                  updateIngredientRow(setter, index, "productId", e.target.value)
                }
              >
                <option value="">Select ingredient</option>
                {ingredientOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.category})
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty required"
                value={ingredient.quantityRequired}
                onChange={(e) =>
                  updateIngredientRow(
                    setter,
                    index,
                    "quantityRequired",
                    e.target.value,
                  )
                }
              />
              <button
                type="button"
                className={dangerBtnClass}
                onClick={() => removeIngredientRow(setter, index)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={ghostBtnClass}
            onClick={() => addIngredientRow(setter)}
          >
            + Add Ingredient
          </button>
        </div>
      </FormGroup>
    );
  }

  function normalizeManagementRows(data: ApiInventoryRow[]) {
    const rows = data.filter(
      (item) => String(item?.item_type ?? "menu_item").trim().toLowerCase() === "menu_item",
    );

    const groupedByName = new Map<string, ApiInventoryRow[]>();
    for (const item of rows) {
      const key = String(item?.product_name ?? item?.name ?? "")
        .trim()
        .toLowerCase();
      const group = groupedByName.get(key) ?? [];
      group.push(item);
      groupedByName.set(key, group);
    }

    return Array.from(groupedByName.values()).map((group) =>
      group.reduce((latest, current) => {
        const latestId = Number(
          latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0,
        );
        const currentId = Number(
          current?.product_id ?? current?.id ?? current?.inventory_id ?? 0,
        );
        return currentId > latestId ? current : latest;
      }),
    );
  }

  const loadProducts = async () => {
    try {
      setLoading(true);
      const [menuData, stockData] = await Promise.all([
        apiCall("/products?item_type=menu_item", { method: "GET" }),
        apiCall("/inventory", { method: "GET" }),
      ]);
      const menuCategoryData = await apiCall("/settings/menu-categories?activeOnly=1", {
        method: "GET",
      }).catch(() => []);
      const productData = Array.isArray(menuData) ? (menuData as ApiInventoryRow[]) : [];
      const inventoryData = Array.isArray(stockData) ? (stockData as ApiInventoryRow[]) : [];
      setMenuCategories(Array.isArray(menuCategoryData) ? (menuCategoryData as MenuCategoryRecord[]) : []);

      const allOptions = inventoryData
        .filter(
          (item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item",
        )
        .map((item) => ({
          id: Number(item.product_id ?? item.id ?? item.inventory_id ?? 0),
          name: String(item.product_name ?? item.name ?? "Unnamed Product"),
          category: String(item.category ?? "Uncategorized"),
          unit: String(item.unit ?? "piece"),
          stock: Number(item.dailyWithdrawn ?? item.quantity ?? item.stock ?? 0),
        }))
        .filter((item) => item.id > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setIngredientOptions(allOptions);

      const normalized = normalizeManagementRows(productData);
      setProducts(
        normalized.map((item) => ({
          id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
          rawProductId: item.product_id ? Number(item.product_id) : undefined,
          rawInventoryId: item.inventory_id
            ? Number(item.inventory_id)
            : undefined,
          menuCode: String(
            item.menu_code ??
              `M-${String(
                item.product_id ?? item.id ?? item.inventory_id ?? 0,
              ).padStart(3, "0")}`,
          ),
          name: item.name || item.product_name || "Unnamed Product",
          category: item.category || "Uncategorized",
          price: String(item.price ?? "0"),
          unit: String(item.unit ?? "piece"),
          stock: Number((item as any).quantity ?? (item as any).stock ?? 0),
          description: String((item as any).description ?? ""),
          image: item.image || "/img/placeholder.jpg",
          availabilityStatus: String(item.availability_status ?? "Available"),
          manualOverride: Boolean(Number(item.manual_override ?? 0)),
          manualStatus: String(item.manual_status ?? "Available"),
          overrideMode: toOverrideMode(
            item.manual_override,
            item.manual_status,
          ),
          availableServings:
            item.available_servings === null ||
            item.available_servings === undefined ||
            String(item.available_servings) === ""
              ? null
              : Number(item.available_servings),
          isPromotional: Boolean(Number(item.is_promotional ?? 0)),
          promoPrice:
            item.promo_price !== null &&
            item.promo_price !== undefined &&
            String(item.promo_price) !== ""
              ? String(item.promo_price)
              : "",
          promoLabel: String(item.promo_label ?? ""),
          ingredients: toIngredientsInput(item.ingredients),
        })),
      );
    } catch (error) {
      console.error("Failed to load products:", error);
      notify(
        addNotification,
        "Failed to load products. Please try refreshing.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  function resetAddForm() {
    setFName("");
    setFCat("");
    setFPrice("");
    setFDesc("");
    setFOverrideMode(OVERRIDE_MODE_OPTIONS[0]);
    setFIngredients([]);
    setFIsPromotional(false);
    setFPromoPrice("");
    setFPromoLabel("");
    setFImageFile(null);
    setFImagePreview("");
  }

  function openEdit(product: MgmtProduct) {
    setEditProduct(product);
    setEName(product.name);
    setECat(product.category);
    setEPrice(product.price);
    setEStock(String(product.stock));
    setEDesc(product.description ?? "");
    setEOverrideMode(product.overrideMode);
    setEIngredients(product.ingredients);
    setEIsPromotional(Boolean(product.isPromotional));
    setEPromoPrice(product.promoPrice ?? "");
    setEPromoLabel(product.promoLabel ?? "");
    setEImageFile(null);
    setEImagePreview(
      product.image && product.image !== "/img/placeholder.jpg"
        ? product.image
        : "",
    );
  }

  async function handleAdd() {
    if (!fName.trim() || !fCat.trim() || !fPrice.trim()) {
      notify(
        addNotification,
        "Please fill in Name, Category, and Price.",
        "warning",
      );
      return;
    }

    try {
      setSaving(true);
      let imageUrl = "/img/placeholder.jpg";
      if (fImageFile) imageUrl = await uploadProductImage(fImageFile);
      const ingredients = buildIngredientPayload(fIngredients);
      const manualOverridePayload = toOverridePayload(fOverrideMode);

      await api.post("/products", {
        name: fName.trim(),
        category: fCat.trim(),
        item_type: "menu_item",
        price: parseFloat(fPrice),
        unit: UNIT_OPTIONS[0],
        quantity: 0,
        description: fDesc.trim() || null,
        image: imageUrl,
        ...manualOverridePayload,
        override_mode: fOverrideMode,
        is_promotional: fIsPromotional,
        promo_price:
          fIsPromotional && fPromoPrice.trim()
            ? parseFloat(fPromoPrice)
            : null,
        promo_label: fIsPromotional ? fPromoLabel.trim() || null : null,
        ingredients,
      });

      await loadProducts();
      setShowAdd(false);
      resetAddForm();
      notify(
        addNotification,
        `"${fName.trim()}" added successfully.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editProduct) return;
    if (!eName.trim() || !eCat.trim() || !ePrice.trim()) {
      notify(
        addNotification,
        "Please fill in Name, Category, and Price.",
        "warning",
      );
      return;
    }

    try {
      setSaving(true);
      let editImageUrl: string | undefined;
      if (eImageFile) {
        editImageUrl = await uploadProductImage(eImageFile);
      } else if (eImagePreview && eImagePreview !== "/img/placeholder.jpg") {
        editImageUrl = eImagePreview;
      }

      const payload: Record<string, unknown> = {
        name: eName.trim(),
        category: eCat.trim(),
        item_type: "menu_item",
        price: parseFloat(ePrice),
        unit: editProduct.unit || UNIT_OPTIONS[0],
        quantity: parseFloat(eStock) || 0,
        description: eDesc.trim() || null,
        ...toOverridePayload(eOverrideMode),
        override_mode: eOverrideMode,
        is_promotional: eIsPromotional,
        promo_price:
          eIsPromotional && ePromoPrice.trim()
            ? parseFloat(ePromoPrice)
            : null,
        promo_label: eIsPromotional ? ePromoLabel.trim() || null : null,
        ingredients: buildIngredientPayload(eIngredients),
      };
      if (editImageUrl) payload.image = editImageUrl;

      await tryPut([`/products/${editProduct.rawProductId ?? editProduct.id}`], payload);
      await loadProducts();
      setEditProduct(null);
      notify(
        addNotification,
        `"${eName.trim()}" updated successfully.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const product = products.find((entry) => entry.id === id);
    const endpointsToTry: string[] = [];
    const pid = product?.rawProductId ?? id;
    const iid = product?.rawInventoryId;
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);

    try {
      setSaving(true);
      let lastErr: unknown;
      let deleted = false;
      for (const endpoint of endpointsToTry) {
        try {
          await apiCall(endpoint, { method: "DELETE" });
          deleted = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
          lastErr = err;
        }
      }
      if (!deleted) throw lastErr;
      await loadProducts();
      setDeleteId(null);
      notify(addNotification, "Product deleted successfully.", "success");
    } catch (error) {
      notify(
        addNotification,
        `Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAvailabilityToggle(product: MgmtProduct) {
    const nextMode: ManualOverrideMode =
      product.overrideMode === "Auto" ? "Force Out of Stock" : "Auto";
    try {
      await tryPut([`/products/${product.rawProductId ?? product.id}`], {
        ...toOverridePayload(nextMode),
        override_mode: nextMode,
      });
      await loadProducts();
      notify(
        addNotification,
        `"${product.name}" override set to ${nextMode}.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update availability: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  const filtered = products.filter((product) => {
    const term = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      product.menuCode.toLowerCase().includes(term) ||
      String(product.promoLabel ?? "").toLowerCase().includes(term)
    );
  });

  const totalValue = products.reduce((sum, product) => {
    const price = parseFloat(String(product.price).replace(/[^0-9.]/g, "")) || 0;
    return sum + price * product.stock;
  }, 0);
  const hiddenCount = products.filter(
    (product) => product.availabilityStatus === "Out of Stock",
  ).length;
  const promoCount = products.filter((product) => product.isPromotional).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
          Menu Administration
        </p>
        <h2 className="text-xl font-bold text-gray-900">Menu Management</h2>
        <p className="text-gray-500 text-sm mt-1">
          Add, edit, hide, promote, and maintain menu items, prices,
          categories, descriptions, images, ingredients, and availability.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Menu Items"
          value={products.length}
          meta="In system"
          color="blue"
        />
        <StatCard
          label="Promotional"
          value={promoCount}
          meta="Special menus"
          color="green"
        />
        <StatCard
          label="Unavailable"
          value={hiddenCount}
          meta="Currently out of stock"
          color="yellow"
        />
        <StatCard
          label="Menu Value"
          value={formatPeso(totalValue)}
          meta={`${outOfStockCount} with zero stock record`}
          color="red"
        />
      </div>

      <SectionHeader
        title="Menu Item List"
        sub="Menu codes, pricing, promotions, and admin-controlled availability in one place"
        cta={
          <div className="flex gap-2">
            <button
              className={primaryBtnClass}
              onClick={() => void loadProducts()}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className={primaryBtnClass}
              onClick={() => setShowAdd(true)}
            >
              + Add Menu Item
            </button>
          </div>
        }
      />

      <div className="mb-[14px]">
        <input
          className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
          placeholder="Search by menu code, name, category, or promo label..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <motion.div
            className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-500"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <p className="text-gray-400 text-sm">Loading menu items...</p>
        </div>
      ) : (
        <DataTable
          cols={[
            "Menu Code",
            "Image",
            "Name",
            "Category",
            "Price",
            "Promo",
            "Status",
            "Actions",
          ]}
          emptyHint="No menu items found. Try refreshing or add a new product."
          rows={filtered.map((product) => (
            <tr
              key={product.id}
              className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
            >
              <td className="px-[14px] py-[11px] text-[12px] font-bold text-indigo-600">
                {product.menuCode}
              </td>
              <td className="px-[14px] py-[11px]">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {product.image && product.image !== "/img/placeholder.jpg" ? (
                    <img
                      src={resolveAssetUrl(product.image)}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-[10px] font-bold">
                      {product.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <div>
                  <div className="text-[12.5px] font-semibold text-gray-900">
                    {product.name}
                  </div>
                  {product.description && (
                    <div className="text-[11px] text-gray-400 max-w-[180px] truncate">
                      {product.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
                  {product.category}
                </span>
              </td>
              <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">
                {formatPeso(parseFloat(String(product.price).replace(/[^0-9.]/g, "")))}
              </td>
              <td className="px-[14px] py-[11px]">
                {product.isPromotional ? (
                  <div className="flex flex-col gap-1">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700">
                      {product.promoLabel || "Promotional"}
                    </span>
                    {product.promoPrice && (
                      <span className="text-[11px] font-semibold text-pink-700">
                        {formatPeso(parseFloat(String(product.promoPrice).replace(/[^0-9.]/g, "")))}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-gray-400">Standard</span>
                )}
              </td>
              <td className="px-[14px] py-[11px]">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    product.availabilityStatus === "Out of Stock"
                      ? "bg-gray-200 text-gray-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {product.availabilityStatus}
                </span>
                <div className="mt-1 text-[10px] text-gray-400">
                  {product.overrideMode === "Auto"
                    ? product.ingredients.length > 0
                      ? "Auto from ingredients"
                      : "Auto from stock fallback"
                    : product.overrideMode}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <div className="flex gap-[5px]">
                  <button
                    className={ghostBtnClass}
                    onClick={() => openEdit(product)}
                  >
                    Edit
                  </button>
                  <button
                    className={ghostBtnClass}
                    onClick={() => void handleAvailabilityToggle(product)}
                  >
                    {product.overrideMode === "Auto"
                      ? "Force Out"
                      : "Set Auto"}
                  </button>
                  <button
                    className={dangerBtnClass}
                    onClick={() => setDeleteId(product.id)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        />
      )}

      {showAdd && (
        <SMModal
          title="Add Menu Item"
          onClose={() => {
            setShowAdd(false);
            resetAddForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowAdd(false);
                  resetAddForm();
                }}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className={primaryBtnClass}
                onClick={() => void handleAdd()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Add Menu Item"}
              </button>
            </>
          }
        >
          <FormInput
            label="Menu Item Name *"
            placeholder="e.g. Chicken Breast"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
          />
          <FormGroup label="Category *">
            <select
              className={inputClass}
              value={fCat}
              onChange={(e) => setFCat(e.target.value)}
            >
              <option value="">Select category</option>
              {menuCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormInput
            label="Price (P) *"
            type="number"
            placeholder="0.00"
            value={fPrice}
            onChange={(e) => setFPrice(e.target.value)}
          />
          <FormGroup label="Availability Mode">
            {renderOverrideButtons(fOverrideMode, setFOverrideMode)}
          </FormGroup>
          {renderIngredientsEditor(fIngredients, setFIngredients)}
          <FormGroup label="Promotional Menu">
            <label className="flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={fIsPromotional}
                onChange={(e) => setFIsPromotional(e.target.checked)}
              />
              Mark this menu item as promotional
            </label>
          </FormGroup>
          {fIsPromotional && (
            <div className="grid grid-cols-2 gap-[10px]">
              <FormInput
                label="Promo Price"
                type="number"
                placeholder="0.00"
                value={fPromoPrice}
                onChange={(e) => setFPromoPrice(e.target.value)}
              />
              <FormInput
                label="Promo Label"
                placeholder="e.g. Summer Special"
                value={fPromoLabel}
                onChange={(e) => setFPromoLabel(e.target.value)}
              />
            </div>
          )}
          <FormGroup label="Description (optional)">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Brief description..."
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label
              className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden"
              style={{ minHeight: fImagePreview ? "auto" : "80px" }}
            >
              {fImagePreview ? (
                <img
                  src={resolveAssetUrl(fImagePreview)}
                  alt="Preview"
                  className="w-full h-[120px] object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    Click to upload image
                  </span>
                  <span className="text-[10px] text-gray-300">
                    PNG, JPG up to 5MB
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFImageFile(file);
                  setFImagePreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </FormGroup>
        </SMModal>
      )}

      {editProduct && (
        <SMModal
          title={`Edit Menu Item - ${editProduct.name}`}
          onClose={() => setEditProduct(null)}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => setEditProduct(null)}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className={primaryBtnClass}
                onClick={() => void handleEdit()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          }
        >
          <div className="mb-3 text-[12px] font-semibold text-indigo-600">
            Menu Code: {editProduct.menuCode}
          </div>
          <FormInput
            label="Menu Item Name *"
            placeholder="e.g. Chicken Breast"
            value={eName}
            onChange={(e) => setEName(e.target.value)}
          />
          <FormGroup label="Category *">
            <select
              className={inputClass}
              value={eCat}
              onChange={(e) => setECat(e.target.value)}
            >
              <option value="">Select category</option>
              {menuCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </FormGroup>
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput
              label="Price (P) *"
              type="number"
              placeholder="0.00"
              value={ePrice}
              onChange={(e) => setEPrice(e.target.value)}
            />
            <FormInput
              label="Stock Qty"
              type="number"
              placeholder="0"
              value={eStock}
              onChange={(e) => setEStock(e.target.value)}
            />
          </div>
          <FormGroup label="Availability Mode">
            {renderOverrideButtons(eOverrideMode, setEOverrideMode)}
            <p className="mt-2 text-[11px] text-gray-400">
              Current customer status: {editProduct.availabilityStatus}
            </p>
          </FormGroup>
          {renderIngredientsEditor(eIngredients, setEIngredients)}
          <FormGroup label="Promotional Menu">
            <label className="flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={eIsPromotional}
                onChange={(e) => setEIsPromotional(e.target.checked)}
              />
              Mark this menu item as promotional
            </label>
          </FormGroup>
          {eIsPromotional && (
            <div className="grid grid-cols-2 gap-[10px]">
              <FormInput
                label="Promo Price"
                type="number"
                placeholder="0.00"
                value={ePromoPrice}
                onChange={(e) => setEPromoPrice(e.target.value)}
              />
              <FormInput
                label="Promo Label"
                placeholder="e.g. Summer Special"
                value={ePromoLabel}
                onChange={(e) => setEPromoLabel(e.target.value)}
              />
            </div>
          )}
          <FormGroup label="Description (optional)">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Brief description..."
              value={eDesc}
              onChange={(e) => setEDesc(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label
              className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden"
              style={{ minHeight: eImagePreview ? "auto" : "80px" }}
            >
              {eImagePreview ? (
                <img
                  src={resolveAssetUrl(eImagePreview)}
                  alt="Preview"
                  className="w-full h-[120px] object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    Click to upload image
                  </span>
                  <span className="text-[10px] text-gray-300">
                    PNG, JPG up to 5MB
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setEImageFile(file);
                  setEImagePreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </FormGroup>
        </SMModal>
      )}

      {deleteId !== null && (
        <SMModal
          title="Delete Menu Item"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => setDeleteId(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={dangerBtnClass}
                onClick={() => void handleDelete(deleteId!)}
                disabled={saving}
              >
                {saving ? "Deleting..." : "Yes, Delete"}
              </button>
            </>
          }
        >
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Are you sure you want to delete{" "}
            <span className="font-bold text-gray-900">
              {products.find((product) => product.id === deleteId)?.name ??
                "this menu item"}
            </span>
            ? This action cannot be undone.
          </p>
        </SMModal>
      )}
    </div>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Main Page ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export default function Inventory() {
  const now = useNow();
  return (
    <div className="flex min-h-screen bg-gray-50 font-[Poppins,sans-serif]">
      <Sidebar />
      <main className="tablet-shell flex-1">
        {/* Page header + clock */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-2 flex flex-wrap items-start justify-between gap-4"
        >
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Menu Administration</p>
            <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          </div>
          <div className="flex flex-col items-end select-none">
            <p className="text-base font-semibold text-gray-700 tabular-nums">
              {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.22 }}
        >
          <MenuAdminTab />
        </motion.div>
      </main>
    </div>
  );
}
