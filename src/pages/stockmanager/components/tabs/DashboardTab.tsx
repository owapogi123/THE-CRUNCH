import { motion, type Variants } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import { KPICard } from "../KPICard";
import type { Product } from "../../types/inventory";

export function DashboardTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  dashboardTopRef,
  totalProductsValue,
  totalWithdrawnValue,
  totalWastedValue,
  totalReturnedValue,
  wholeChickenProducts,
  choppedChickenProducts,
  dashboardSubTab,
  onSummarySelect,
  mainStockContent,
  lastUpdatesContent,
  recordSpoilageContent,
  cookReportContent,
  stockMovementContent,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  dashboardTopRef: RefObject<HTMLDivElement | null>;
  totalProductsValue: string;
  totalWithdrawnValue: string;
  totalWastedValue: string;
  totalReturnedValue: string;
  wholeChickenProducts: Product[];
  choppedChickenProducts: Product[];
  dashboardSubTab:
    | "main-stock"
    | "last-updates"
    | "record-spoilage"
    | "stock-movement"
    | "cook-report";
  onSummarySelect: (
    key: "products" | "withdrawn" | "wasted" | "returned",
  ) => void;
  mainStockContent: ReactNode;
  lastUpdatesContent: ReactNode;
  recordSpoilageContent: ReactNode;
  cookReportContent: ReactNode;
  stockMovementContent: ReactNode;
}) {
  return (
    <motion.div
      key="dashboard"
      id="dashboard-top"
      variants={pageVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      ref={dashboardTopRef}
    >
      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6 pt-6"
      >
        <motion.div variants={staggerVariants} className="grid grid-cols-4 gap-4">
          <KPICard
            itemVariants={itemVariants}
            label="Total Products"
            value={totalProductsValue}
            sub="in inventory"
            accent="slate"
            onClick={() => onSummarySelect("products")}
          />
          <KPICard
            itemVariants={itemVariants}
            label="Released Today"
            value={totalWithdrawnValue}
            sub="units sent to kitchen"
            accent="indigo"
            onClick={() => onSummarySelect("withdrawn")}
          />
          <KPICard
            itemVariants={itemVariants}
            label="Wasted Today"
            value={totalWastedValue}
            sub="units spoiled"
            accent="rose"
            onClick={() => onSummarySelect("wasted")}
          />
          <KPICard
            itemVariants={itemVariants}
            label="Returned Today"
            value={totalReturnedValue}
            sub="units returned"
            accent="emerald"
            onClick={() => onSummarySelect("returned")}
          />
        </motion.div>

        {(wholeChickenProducts.length > 0 || choppedChickenProducts.length > 0) && (
          <motion.div
            variants={itemVariants}
            className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-6"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{"\uD83C\uDF57"}</span>
              <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">
                Chicken Inventory
              </span>
            </div>
            <div className="flex gap-6 flex-1">
              {wholeChickenProducts.map((p) => (
                <div key={p.product_id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <div>
                    <p className="text-xs text-orange-600 font-medium">
                      Whole Chicken
                    </p>
                    <p className="text-sm font-bold text-orange-800">
                      {p.mainStock}{" "}
                      <span className="text-xs font-normal text-orange-500">
                        {p.unit}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
              {wholeChickenProducts.length > 0 &&
                choppedChickenProducts.length > 0 && (
                  <div className="flex items-center text-orange-200 text-lg font-light">
                    {"\u2192"}
                  </div>
                )}
              {choppedChickenProducts.map((p) => (
                <div key={p.product_id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <div>
                    <p className="text-xs text-amber-600 font-medium">
                      Chopped Chicken
                    </p>
                    <p className="text-sm font-bold text-amber-800">
                      {p.mainStock}{" "}
                      <span className="text-xs font-normal text-amber-500">
                        {p.unit}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-orange-400 italic">
              Delivered whole {"\u2192"} chopped separately in inventory
            </p>
          </motion.div>
        )}

        {dashboardSubTab === "main-stock" && mainStockContent}
        {dashboardSubTab === "last-updates" && lastUpdatesContent}
        {dashboardSubTab === "record-spoilage" && recordSpoilageContent}
        {dashboardSubTab === "cook-report" && cookReportContent}
        {dashboardSubTab === "stock-movement" && stockMovementContent}
      </motion.div>
    </motion.div>
  );
}
