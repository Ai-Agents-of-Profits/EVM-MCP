/**
 * Transaction and Task Queue System
 * 
 * This module provides a way to handle blockchain transactions and long-running tasks asynchronously,
 * allowing the API to respond immediately while operations are processed in the background.
 */

import { EventEmitter } from 'events';

// Define transaction status types
export type TransactionStatus = 'pending' | 'confirming' | 'confirmed' | 'failed';

// Define task status types
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Define transaction record structure
export interface TransactionRecord {
  id: string;
  hash?: string;
  status: TransactionStatus;
  type: string;
  params: any;
  result?: any;
  error?: any;
  timestamp: number;
  confirmationTimestamp?: number;
}

// Define task record structure
export interface TaskRecord {
  status: TaskStatus;
  message: string;
  progress: number;
  result: any;
}

class TransactionQueue {
  private queue: Map<string, TransactionRecord> = new Map();
  private tasks: Map<string, TaskRecord> = new Map();
  private events: EventEmitter = new EventEmitter();
  
  // Store maximum number of transactions to keep in history
  private maxHistorySize: number = 100;
  
  constructor() {
    // Set higher max listeners to avoid warnings
    this.events.setMaxListeners(100);
  }
  
  /**
   * Create a new transaction record
   */
  public createTransaction(type: string, params: any): string {
    const id = this.generateTransactionId();
    
    const transaction: TransactionRecord = {
      id,
      status: 'pending',
      type,
      params,
      timestamp: Date.now(),
    };
    
    this.queue.set(id, transaction);
    this.events.emit('transaction:created', transaction);
    
    return id;
  }
  
  /**
   * Update an existing transaction with a hash
   */
  public setTransactionHash(id: string, hash: string): void {
    const transaction = this.queue.get(id);
    if (!transaction) return;
    
    transaction.hash = hash;
    transaction.status = 'confirming';
    
    this.queue.set(id, transaction);
    this.events.emit('transaction:updated', transaction);
  }
  
  /**
   * Mark a transaction as confirmed with results
   */
  public confirmTransaction(id: string, result: any): void {
    const transaction = this.queue.get(id);
    if (!transaction) return;
    
    transaction.status = 'confirmed';
    transaction.result = result;
    transaction.confirmationTimestamp = Date.now();
    
    this.queue.set(id, transaction);
    this.events.emit('transaction:confirmed', transaction);
    
    // Clean up old transactions
    this.cleanupOldTransactions();
  }
  
  /**
   * Mark a transaction as failed
   */
  public failTransaction(id: string, error: any): void {
    const transaction = this.queue.get(id);
    if (!transaction) return;
    
    transaction.status = 'failed';
    transaction.error = error;
    
    this.queue.set(id, transaction);
    this.events.emit('transaction:failed', transaction);
  }
  
  /**
   * Get transaction status by ID
   */
  public getTransaction(id: string): TransactionRecord | undefined {
    return this.queue.get(id);
  }
  
  /**
   * Get all transactions
   */
  public getAllTransactions(): TransactionRecord[] {
    return Array.from(this.queue.values());
  }
  
  /**
   * Subscribe to transaction events
   */
  public subscribeToTransaction(id: string, callback: (transaction: TransactionRecord) => void): () => void {
    const handler = (transaction: TransactionRecord) => {
      if (transaction.id === id) {
        callback(transaction);
      }
    };
    
    this.events.on('transaction:updated', handler);
    this.events.on('transaction:confirmed', handler);
    this.events.on('transaction:failed', handler);
    
    // Return unsubscribe function
    return () => {
      this.events.off('transaction:updated', handler);
      this.events.off('transaction:confirmed', handler);
      this.events.off('transaction:failed', handler);
    };
  }
  
  /**
   * Update the status of a task
   */
  public updateTaskStatus(taskId: string, taskRecord: TaskRecord): void {
    this.tasks.set(taskId, taskRecord);
    this.events.emit('task:updated', { id: taskId, ...taskRecord });
  }
  
  /**
   * Get the status of a task
   */
  public getTaskStatus(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }
  
  /**
   * Remove a task
   */
  public removeTask(taskId: string): void {
    this.tasks.delete(taskId);
  }
  
  /**
   * Get all tasks
   */
  public getAllTasks(): Map<string, TaskRecord> {
    return new Map(this.tasks);
  }
  
  /**
   * Subscribe to task events
   */
  public subscribeToTask(id: string, callback: (task: TaskRecord & { id: string }) => void): () => void {
    const handler = (task: TaskRecord & { id: string }) => {
      if (task.id === id) {
        callback(task);
      }
    };
    
    this.events.on('task:updated', handler);
    
    // Return unsubscribe function
    return () => {
      this.events.off('task:updated', handler);
    };
  }
  
  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  /**
   * Clean up old transactions to prevent memory leaks
   */
  private cleanupOldTransactions(): void {
    const transactions = this.getAllTransactions();
    
    if (transactions.length <= this.maxHistorySize) return;
    
    // Sort by timestamp (oldest first)
    const sorted = transactions.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest transactions that exceed our limit
    const toRemove = sorted.slice(0, sorted.length - this.maxHistorySize);
    
    for (const tx of toRemove) {
      this.queue.delete(tx.id);
    }
  }
}

// Export singleton instance
export const transactionQueue = new TransactionQueue();
export default transactionQueue;
