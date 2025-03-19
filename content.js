class MarketMind {
  constructor() {
    this.viewedListings = new Set()
    this.debug = true // toggle for debug mode
    this.logs = [] // store logs in memory
    this.maxLogs = 100 // maximum number of logs to keep
    this.stats = {
      pageLoads: 0,
      markingAttempts: 0,
      itemsFound: 0,
      itemsMarked: 0,
      storageOps: 0,
      errors: 0,
      lastUpdate: Date.now()
    }
    this.clickHandlers = new Map() // add this line to store click handlers
    this.debounceTimeout = null
    this.lastUpdate = 0
    this.updateThrottle = 1000 // 1 second minimum between updates
    this.init()
  }

  log(...args) {
    const timestamp = new Date().toISOString()
    const message = args.join(' ')
    
    // store log in memory
    this.logs.unshift({ timestamp, message })
    if (this.logs.length > this.maxLogs) this.logs.pop()
    
    // send to console if debug is enabled
    if (this.debug) console.log(`[MarketMind][${timestamp}]`, ...args)
    
    // save logs to storage periodically
    this.saveLogs()
    
    // update debug panel if it exists
    this.updateDebugPanel()
  }
  
  async saveLogs() {
    try {
      await chrome.storage.local.set({ mmLogs: this.logs })
    } catch (err) {
      console.error('Error saving logs:', err)
    }
  }

  async init() {
    try {
      // load viewed listings from storage
      const stored = await chrome.storage.local.get(['viewedListings', 'stats'])
      if (stored.viewedListings) {
        this.viewedListings = new Set(stored.viewedListings)
        this.log('Loaded from storage:', this.viewedListings.size, 'items')
      }
      if (stored.stats) this.stats = stored.stats
      
      this.stats.pageLoads++
      this.updateStats()
      
      this.observeListings()
      await this.markViewedListings()
      this.attachListeners()

      // Setup keyboard shortcut as fallback
      this.setupKeyboardShortcut();
      
      // Add debug info to page
      if (this.debug) this.addIframePanel()
      
      // Add direct event handlers for debugging FB's events
      this.setupEventDebugger()
    } catch (err) {
      this.stats.errors++
      this.log('Init error:', err.message)
    }
  }

  observeListings() {
    try {
      const observer = new MutationObserver(() => {
        // debounce the callback
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout)
        this.debounceTimeout = setTimeout(() => this.markViewedListings(), 250)
      })
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false  // remove attribute watching since we don't need it
      })
      this.log('Observer attached')
    } catch (err) {
      this.log('Observer error:', err)
    }
  }

  async markViewedListings() {
    try {
      this.stats.markingAttempts++
      const listings = document.querySelectorAll('a[href*="/marketplace/item/"]')
      this.stats.itemsFound = listings.length
      this.log(`Found ${listings.length} listings`)
      
      let markedCount = 0
      for (const listing of listings) {
        const id = this.getListingId(listing.href)
        if (!id) continue
        
        if (this.viewedListings.has(id)) {
          if (!listing.classList.contains('mm-viewed')) {
            listing.classList.add('mm-viewed')
            markedCount++
          }
        }
        
        // Only add handlers if they don't exist
        if (!listing.dataset.mmHandled) {
          const clickHandler = (e) => {
            this.log(`Listing clicked: ${id}`)
            setTimeout(() => this.markAsViewed(id, listing), 0)
          }
          
          this.setClickHandlerFor(id, clickHandler)
          listing.addEventListener('click', clickHandler)
          listing.addEventListener('auxclick', clickHandler)
          listing.dataset.mmHandled = 'true'
        }
      }
      
      this.stats.itemsMarked = markedCount
      this.throttledUpdateStats()
    } catch (err) {
      this.stats.errors++
      this.log('Mark listings error:', err)
    }
  }

  getListingId(url) {
    try {
      return url.split('/marketplace/item/')[1]?.split('/')[0]
    } catch (err) {
      this.log('Get ID error:', err, 'URL:', url)
      return null
    }
  }

  async markAsViewed(id, element) {
    try {
      if (!id) {
        this.log('No ID found for clicked listing')
        return
      }
      
      this.log(`Marking item as viewed: ${id}`)
      
      const beforeSize = this.viewedListings.size
      this.viewedListings.add(id)
      
      this.log(`Adding class to element: ${element.href}`)
      element.classList.add('mm-viewed')
      
      // verify the item was actually added
      if (this.viewedListings.size === beforeSize) {
        this.log('Warning: Item not added to set:', id)
      } else {
        this.log(`Item successfully added to viewed set. New size: ${this.viewedListings.size}`)
      }
      
      // save to storage with verification
      this.log('Saving updated list to storage...')
      await this.saveToStorage()
      
      this.log('Verifying storage update...')
      const verify = await chrome.storage.local.get('viewedListings')
      if (!verify.viewedListings?.includes(id)) {
        this.log('Warning: Storage verification failed for:', id)
      } else {
        this.log('Storage verification successful')
      }
      
      this.updateDebugPanel()
    } catch (err) {
      this.log('Error in markAsViewed:', err.message, err.stack)
      this.stats.errors++
    }
  }

  async saveToStorage() {
    try {
      this.stats.storageOps++
      this.stats.lastUpdate = Date.now()
      await chrome.storage.local.set({
        viewedListings: Array.from(this.viewedListings),
        stats: this.stats
      })
      this.log('Saved to storage:', this.viewedListings.size, 'items')
      this.updateStats()
    } catch (err) {
      this.stats.errors++
      this.log('Save error:', err)
    }
  }

  attachListeners() {
    // handle navigation and dynamic content loading
    window.addEventListener('popstate', async () => {
      this.log('Navigation detected')
      await this.markViewedListings()
    })
  }

  updateStats() {
    const stats = {
      action: 'updateStats', 
      stats: this.stats,
      viewedCount: this.viewedListings.size,
      timestamp: Date.now()
    };

    // Update storage first
    chrome.storage.local.set({ currentStats: stats }).catch(err => {
      this.log('Stats storage error:', err);
    });

    // Then send message
    chrome.runtime.sendMessage(stats).catch(err => {
      // Only log unique errors
      if (!err.message.includes('message channel closed')) {
        this.log('Stats update error:', err);
      }
    });
  }

  addIframePanel() {
    // Remove existing panel if any
    const existingFrame = document.getElementById('mm-iframe-panel');
    if (existingFrame) existingFrame.remove();
    
    // Create an iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'mm-iframe-panel';
    
    // Style the iframe
    Object.assign(iframe.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '220px',
      height: '120px',
      border: 'none',
      background: 'transparent',
      zIndex: '2147483647'
    });
    
    // Set src to local panel.html
    const extensionId = chrome.runtime.id;
    iframe.src = `chrome-extension://${extensionId}/panel.html`;
    
    // Add the iframe to the page
    document.body.appendChild(iframe);
    
    // Listen for messages from the iframe
    window.addEventListener('message', event => {
      if (event.data && event.data.action) {
        if (event.data.action === 'view') this.showStorage();
        if (event.data.action === 'clear') this.clearStorage();
      }
    });
    
    // Send initial data
    this.updateIframeData();
    
    this.log('Iframe panel added');
  }

  // Add this method to update iframe data
  updateIframeData() {
    const iframe = document.getElementById('mm-iframe-panel');
    if (iframe) {
      iframe.contentWindow.postMessage({
        type: 'update',
        viewedCount: this.viewedListings.size,
        foundItems: this.stats.itemsFound
      }, '*');
    }
  }

  updateDebugPanel() {
    if (!this.debugPanel) return
    
    // Create a unique URL to the stats page
    const extensionId = chrome.runtime.id
    const statsUrl = `chrome-extension://${extensionId}/stats.html`
    
    // Create the log entries HTML
    const logEntriesHtml = this.logs.slice(0, 10).map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      return `<div class="log-entry">[${time}] ${log.message}</div>`
    }).join('')
    
    this.debugPanel.innerHTML = `
      <div class="panel-title">MarketMind Debug</div>
      <div class="panel-content">
        <div>Viewed: ${this.viewedListings.size}</div>
        <div>Found: ${this.stats.itemsFound} | Marked: ${this.stats.itemsMarked}</div>
        <div>Storage Ops: ${this.stats.storageOps} | Errors: ${this.stats.errors}</div>
      </div>
      <div>
        <button id="mm-view-btn">View Storage</button>
        <button id="mm-clear-btn">Clear</button>
        <button id="mm-stats-btn">Stats</button>
      </div>
      <div class="log-container">
        ${logEntriesHtml || '<div class="log-entry">No logs yet</div>'}
      </div>
    `
    
    // Add event listeners (can't use inline onclick in shadow DOM)
    setTimeout(() => {
      const viewBtn = this.debugPanel.querySelector('#mm-view-btn')
      const clearBtn = this.debugPanel.querySelector('#mm-clear-btn')
      const statsBtn = this.debugPanel.querySelector('#mm-stats-btn')
      
      if (viewBtn) viewBtn.addEventListener('click', () => this.showStorage())
      if (clearBtn) clearBtn.addEventListener('click', () => this.clearStorage())
      if (statsBtn) statsBtn.addEventListener('click', () => window.open(statsUrl, '_blank'))
    }, 0)
  }

  async showStorage() {
    try {
      const stored = await chrome.storage.local.get('viewedListings')
      console.table(stored.viewedListings || [])
    } catch (err) {
      this.log('Show storage error:', err)
    }
  }

  async clearStorage() {
    try {
      await chrome.storage.local.clear()
      this.viewedListings.clear()
      this.log('Storage cleared')
      this.updateDebugPanel()
    } catch (err) {
      this.log('Clear storage error:', err)
    }
  }

  openStatsPage() {
    const extensionId = chrome.runtime.id;
    const url = `chrome-extension://${extensionId}/stats.html`;
    window.open(url, '_blank');
    return url;
  }

  setupEventDebugger() {
    // Capture clicks on the document to see what's happening
    document.addEventListener('click', e => {
      // Check if the click was on or inside a marketplace item
      const isMarketplaceItem = e.target.closest('a[href*="/marketplace/item/"]')
      if (isMarketplaceItem) {
        this.log(`Document click captured on marketplace item: ${isMarketplaceItem.href}`)
        
        // Try to extract ID
        const id = this.getListingId(isMarketplaceItem.href)
        if (id) {
          this.log(`Item ID from capture: ${id}`)
          // Mark after a delay to ensure it happens after Facebook's handlers
          setTimeout(() => {
            this.markAsViewed(id, isMarketplaceItem)
          }, 100)
        }
      }
    }, true) // Use capture phase to get events before Facebook
    
    this.log('Event debugger set up')
  }

  monitorPanel() {
    // Monitor if our panel gets removed
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.removedNodes.length) {
          // Check if our panel was removed
          const panelRemoved = Array.from(mutation.removedNodes).some(node => 
            node.id === 'mm-debug-panel' || 
            (node.querySelector && node.querySelector('#mm-debug-panel'))
          );
          
          if (panelRemoved) {
            this.log('Panel was removed, re-adding...');
            setTimeout(() => this.addDebugPanel(), 100);
            break;
          }
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    this.log('Panel monitor active');
  }

  // Keyboard shortcut setup
  setupKeyboardShortcut() {
    document.addEventListener('keydown', event => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'm') {
        this.log('Opening stats page via keyboard shortcut');
        this.openStatsPage();
      }
    });
    this.log('Open-Stats-Page Keyboard shortcut registered: Alt+Shift+M');
  }

  setClickHandlerFor(id, handler) {
    this.clickHandlers.set(id, handler)
  }

  getClickHandlerFor(id) {
    return this.clickHandlers.get(id)
  }

  // Add throttled stats update
  throttledUpdateStats() {
    const now = Date.now()
    if (now - this.lastUpdate >= this.updateThrottle) {
      this.updateStats()
      this.lastUpdate = now
    }
  }
}

// make it globally accessible for debugging
window.marketMind = new MarketMind()

// Create a keyboard shortcut to open stats (Alt+Shift+S)
document.addEventListener('keydown', event => {
  if (event.altKey && event.shiftKey && event.key === 'S') {
    console.log('Opening stats page...');
    const url = window.marketMind.openStatsPage();
    console.log('Stats page URL:', url);
  }
});

// Add a keyboard shortcut for opening the stats page (Alt+Shift+M)
document.addEventListener('keydown', event => {
  if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'm') {
    this.log('Keyboard shortcut pressed');
    this.openStatsPage();
  }
}); 