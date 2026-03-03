/**
 * Batch Management Utilities
 * Handles FIFO (First In First Out) inventory operations
 */

export interface Batch {
  id: string
  productId: number
  quantity: number
  unit: string
  receivedAt: Date
  expiresAt?: Date
  status: "active" | "partial" | "returned"
}

/**
 * Consumes product quantity using FIFO method
 * @param batches - Array of batches to consume from
 * @param quantityToConsume - Amount to consume
 * @returns Object containing consumption details
 */
export function consumeFromBatchesFIFO(
  batches: Batch[],
  quantityToConsume: number
): {
  consumed: number
  batchesAffected: Array<{ batchId: string; quantityConsumed: number }>
  remainingQuantity: number
} {
  const activeBatches = batches
    .filter(b => b.status === "active")
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())

  let remaining = quantityToConsume
  const batchesAffected: Array<{ batchId: string; quantityConsumed: number }> = []

  for (const batch of activeBatches) {
    if (remaining <= 0) break

    const canConsume = Math.min(batch.quantity, remaining)
    batchesAffected.push({
      batchId: batch.id,
      quantityConsumed: canConsume
    })
    remaining -= canConsume
  }

  return {
    consumed: quantityToConsume - remaining,
    batchesAffected,
    remainingQuantity: remaining
  }
}

/**
 * Gets the oldest active batch
 * @param batches - Array of batches to search
 * @returns The oldest batch or null if no active batches
 */
export function getOldestActiveBatch(batches: Batch[]): Batch | null {
  const activeBatches = batches.filter(b => b.status === "active")
  if (activeBatches.length === 0) return null

  return activeBatches.reduce((oldest, current) =>
    oldest.receivedAt < current.receivedAt ? oldest : current
  )
}

/**
 * Calculates total quantity of active batches
 * @param batches - Array of batches to sum
 * @returns Total quantity of active batches
 */
export function getTotalActiveBatchQuantity(batches: Batch[]): number {
  return batches
    .filter(b => b.status === "active")
    .reduce((sum, batch) => sum + batch.quantity, 0)
}

/**
 * Gets days since batch was received
 * @param batch - Batch to check
 * @returns Number of days since received
 */
export function getDaysSinceReceived(batch: Batch): number {
  return Math.floor((Date.now() - batch.receivedAt.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Checks if batch is expired
 * @param batch - Batch to check
 * @returns True if expired, false otherwise
 */
export function isBatchExpired(batch: Batch): boolean {
  if (!batch.expiresAt) return false
  return new Date() > batch.expiresAt
}

/**
 * Returns batches close to expiration (within days)
 * @param batches - Array of batches to check
 * @param daysThreshold - Number of days until expiration (default 3)
 * @returns Array of batches close to expiration
 */
export function getExpiringBatches(batches: Batch[], daysThreshold: number = 3): Batch[] {
  const now = new Date()
  return batches.filter(batch => {
    if (!batch.expiresAt || batch.status !== "active") return false
    const daysUntilExpiry = Math.floor(
      (batch.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilExpiry >= 0 && daysUntilExpiry <= daysThreshold
  })
}

/**
 * Generates batch report for a day
 * @param batches - Array of batches
 * @param date - Date to report on
 * @returns Report object
 */
export function generateBatchReport(batches: Batch[], date: Date = new Date()) {
  const activeBatches = batches.filter(b => b.status === "active")
  const partialBatches = batches.filter(b => b.status === "partial")
  const returnedBatches = batches.filter(b => b.status === "returned")

  const totalActive = getTotalActiveBatchQuantity(activeBatches)
  const expiringBatches = getExpiringBatches(activeBatches, 3)

  return {
    date: date.toLocaleDateString(),
    totalBatches: batches.length,
    activeBatches: activeBatches.length,
    partialBatches: partialBatches.length,
    returnedBatches: returnedBatches.length,
    totalActiveQuantity: totalActive,
    expiringBatchesCount: expiringBatches.length,
    expiringBatches: expiringBatches
  }
}

/**
 * Exports batch data to CSV format
 * @param batches - Array of batches to export
 * @returns CSV formatted string
 */
export function exportBatchesToCSV(batches: Batch[]): string {
  const headers = ["Batch ID", "Product ID", "Quantity", "Unit", "Received", "Expires", "Status"]
  const rows = batches.map(b => [
    b.id,
    b.productId.toString(),
    b.quantity.toString(),
    b.unit,
    b.receivedAt.toLocaleString(),
    b.expiresAt?.toLocaleDateString() || "N/A",
    b.status
  ])

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n")

  return csvContent
}
