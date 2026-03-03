/**
 * Backend Integration Guide for Batch Inventory Management
 * 
 * This file demonstrates how to integrate the batch inventory system
 * with your backend API and database.
 */

// ============================================
// 1. BACKEND API ENDPOINTS NEEDED
// ============================================

/**
 * Required API Endpoints:
 * 
 * GET /api/inventory
 *   - Returns all inventory items with their batches
 *   - Response: Array<InventoryItem>
 * 
 * POST /api/inventory/batches
 *   - Creates a new batch for a product
 *   - Body: { productId, quantity, unit, expiresAt? }
 *   - Response: { success, batch }
 * 
 * PUT /api/inventory/batches/:batchId
 *   - Updates a batch (quantity, status, etc.)
 *   - Body: { quantity?, status?, expiresAt? }
 *   - Response: { success, batch }
 * 
 * DELETE /api/inventory/batches/:batchId
 *   - Deletes a batch
 *   - Response: { success }
 * 
 * POST /api/inventory/batches/:batchId/consume
 *   - Records product consumption from batch
 *   - Body: { quantity, consumedAt? }
 *   - Response: { success, consumed }
 * 
 * POST /api/inventory/batches/:batchId/return
 *   - Records batch return at end of day
 *   - Body: { quantity, returnedAt? }
 *   - Response: { success, returned }
 * 
 * GET /api/inventory/report/daily
 *   - Gets daily batch report
 *   - Query: ?date=YYYY-MM-DD
 *   - Response: { report }
 */

// ============================================
// 2. DATABASE SCHEMA
// ============================================

/**
 * Database Tables:
 * 
 * batches table:
 * - id: UUID PRIMARY KEY
 * - product_id: INT FOREIGN KEY
 * - quantity: DECIMAL(10,2)
 * - unit: VARCHAR(20)
 * - received_at: TIMESTAMP
 * - expires_at: TIMESTAMP NULL
 * - status: ENUM('active', 'partial', 'returned')
 * - created_at: TIMESTAMP
 * - updated_at: TIMESTAMP
 * - INDEX: (product_id, status), (received_at)
 * 
 * batch_consumption table:
 * - id: UUID PRIMARY KEY
 * - batch_id: UUID FOREIGN KEY
 * - quantity: DECIMAL(10,2)
 * - consumed_at: TIMESTAMP
 * - user_id: INT FOREIGN KEY (optional)
 * 
 * batch_returns table:
 * - id: UUID PRIMARY KEY
 * - batch_id: UUID FOREIGN KEY
 * - quantity: DECIMAL(10,2)
 * - returned_at: TIMESTAMP
 * - user_id: INT FOREIGN KEY (optional)
 * - reason: TEXT
 */

// ============================================
// 3. EXAMPLE BACKEND IMPLEMENTATION
// ============================================

/**
 * Express.js Backend Example
 */

// routes/batches.js
/*
const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const Product = require('../models/Product');

// GET all inventory items with batches
router.get('/inventory', async (req, res) => {
  try {
    const products = await Product.find();
    const itemsWithBatches = await Promise.all(
      products.map(async (product) => {
        const batches = await Batch.find({
          productId: product.id,
          status: { $ne: 'archived' }
        }).sort({ receivedAt: 1 });

        return {
          ...product.toObject(),
          batches: batches.map(b => ({
            ...b.toObject(),
            receivedAt: new Date(b.receivedAt),
            expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined
          }))
        };
      })
    );

    res.json(itemsWithBatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Add new batch
router.post('/batches', async (req, res) => {
  try {
    const { productId, quantity, unit, expiresAt } = req.body;

    const batch = new Batch({
      productId,
      quantity,
      unit,
      receivedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'active'
    });

    await batch.save();

    res.json({
      success: true,
      batch: {
        ...batch.toObject(),
        receivedAt: new Date(batch.receivedAt),
        expiresAt: batch.expiresAt ? new Date(batch.expiresAt) : undefined
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT - Update batch
router.put('/batches/:batchId', async (req, res) => {
  try {
    const { quantity, status, expiresAt } = req.body;
    const batch = await Batch.findByIdAndUpdate(
      req.params.batchId,
      {
        ...(quantity !== undefined && { quantity }),
        ...(status && { status }),
        ...(expiresAt && { expiresAt: new Date(expiresAt) })
      },
      { new: true }
    );

    res.json({
      success: true,
      batch: {
        ...batch.toObject(),
        receivedAt: new Date(batch.receivedAt),
        expiresAt: batch.expiresAt ? new Date(batch.expiresAt) : undefined
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Remove batch
router.delete('/batches/:batchId', async (req, res) => {
  try {
    await Batch.findByIdAndDelete(req.params.batchId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST - Consume from batch
router.post('/batches/:batchId/consume', async (req, res) => {
  try {
    const { quantity } = req.body;
    const batch = await Batch.findById(req.params.batchId);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const consumed = Math.min(batch.quantity, quantity);
    batch.quantity -= consumed;
    batch.status = batch.quantity > 0 ? 'partial' : 'consumed';

    await batch.save();

    // Log consumption
    const consumption = await Consumption.create({
      batchId: batch._id,
      quantity: consumed,
      consumedAt: new Date(),
      userId: req.user?.id
    });

    res.json({ success: true, consumed, consumption });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST - Return batch quantity
router.post('/batches/:batchId/return', async (req, res) => {
  try {
    const { quantity, reason } = req.body;
    const batch = await Batch.findById(req.params.batchId);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const returned = Math.min(batch.quantity, quantity);
    batch.quantity -= returned;
    batch.status = batch.quantity <= 0 ? 'returned' : 'partial';

    await batch.save();

    // Log return
    const batchReturn = await Return.create({
      batchId: batch._id,
      quantity: returned,
      returnedAt: new Date(),
      userId: req.user?.id,
      reason: reason || 'End of day return'
    });

    res.json({ success: true, returned, batchReturn });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET - Daily report
router.get('/report/daily', async (req, res) => {
  try {
    const { date = new Date() } = req.query;
    const queryDate = new Date(date);
    const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));

    const batches = await Batch.find();
    const consumptions = await Consumption.find({
      consumedAt: { $gte: startOfDay, $lte: endOfDay }
    });
    const returns = await Return.find({
      returnedAt: { $gte: startOfDay, $lte: endOfDay }
    });

    res.json({
      date: queryDate.toLocaleDateString(),
      totalBatches: batches.length,
      activeBatches: batches.filter(b => b.status === 'active').length,
      totalConsumed: consumptions.reduce((sum, c) => sum + c.quantity, 0),
      totalReturned: returns.reduce((sum, r) => sum + r.quantity, 0),
      consumptions,
      returns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
*/

// ============================================
// 4. FRONTEND API INTEGRATION
// ============================================

/**
 * Example: Using batch system with real API
 */

import { apiCall } from '@/lib/api'

export const batchAPI = {
  // Get all inventory
  async fetchInventory() {
    return apiCall('/api/inventory', {
      method: 'GET'
    })
  },

  // Add batch
  async addBatch(productId: number, quantity: number, unit: string, expiresAt?: Date) {
    return apiCall('/api/inventory/batches', {
      method: 'POST',
      body: {
        productId,
        quantity,
        unit,
        expiresAt: expiresAt?.toISOString()
      }
    })
  },

  // Update batch
  async updateBatch(batchId: string, data: { quantity?: number; status?: string; expiresAt?: Date }) {
    return apiCall(`/api/inventory/batches/${batchId}`, {
      method: 'PUT',
      body: {
        ...data,
        expiresAt: data.expiresAt?.toISOString()
      }
    })
  },

  // Delete batch
  async deleteBatch(batchId: string) {
    return apiCall(`/api/inventory/batches/${batchId}`, {
      method: 'DELETE'
    })
  },

  // Consume from batch
  async consumeBatch(batchId: string, quantity: number) {
    return apiCall(`/api/inventory/batches/${batchId}/consume`, {
      method: 'POST',
      body: { quantity }
    })
  },

  // Return batch
  async returnBatch(batchId: string, quantity: number, reason?: string) {
    return apiCall(`/api/inventory/batches/${batchId}/return`, {
      method: 'POST',
      body: { quantity, reason }
    })
  },

  // Get daily report
  async getDailyReport(date?: Date) {
    const dateStr = date?.toISOString().split('T')[0]
    return apiCall(`/api/inventory/report/daily?${dateStr ? `date=${dateStr}` : ''}`)
  },

  // Add new product (optional helper)
  async addProduct(name: string, category: string, price: string, unit: string, stock: number) {
    // note: backend currently uses /api/products
    return apiCall('/api/products', {
      method: 'POST',
      body: { name, category, price, unit, quantity: stock }
    })
  }
}

/**
 * Example: Using in React component
 */

/*
import { useEffect, useState } from 'react'
import { useBatchInventory } from '@/hooks/useBatchInventory'
import { batchAPI } from '@/lib/batchAPI'

export function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const { items, addBatch, returnBatchQuantity, setItems } = useBatchInventory([])

  useEffect(() => {
    const loadInventory = async () => {
      try {
        const data = await batchAPI.fetchInventory()
        setItems(data)
      } catch (error) {
        console.error('Failed to load inventory:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInventory()
  }, [])

  const handleBatchAdded = async (item, batch) => {
    try {
      const result = await batchAPI.addBatch(
        item.id,
        batch.quantity,
        batch.unit,
        batch.expiresAt
      )
      addBatch(item.id, batch.quantity, batch.unit, batch.expiresAt)
    } catch (error) {
      console.error('Failed to add batch:', error)
      alert('Failed to add batch')
    }
  }

  const handleBatchReturned = async (item, batchId, returnedQty) => {
    try {
      await batchAPI.returnBatch(batchId, returnedQty, 'End of day return')
      returnBatchQuantity(item.id, batchId, returnedQty)
    } catch (error) {
      console.error('Failed to return batch:', error)
      alert('Failed to return batch')
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <InventoryClient
      items={items}
      onBatchAdded={handleBatchAdded}
      onBatchReturned={handleBatchReturned}
    />
  )
}
*/

// ============================================
// 5. ERROR HANDLING
// ============================================

/**
 * Error handling wrapper
 */

export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : errorMessage
    console.error(`[Batch API Error] ${message}`, error)
    return { success: false, error: message }
  }
}

// ============================================
// 6. MIGRATION GUIDE
// ============================================

/**
 * Steps to integrate with existing system:
 * 
 * 1. Create database tables (batches, batch_consumption, batch_returns)
 * 2. Create backend API routes for batch operations
 * 3. Test API endpoints with Postman/insomnia
 * 4. Update InventoryItem interface in database
 * 5. Create migration script for existing data
 * 6. Update frontend to call API instead of local state
 * 7. Add error handling and validation
 * 8. Test end-to-end workflow
 * 9. Deploy and monitor
 * 10. Archive old batch data (optional)
 */

export default {}
