document.addEventListener('DOMContentLoaded', () => {
  // Show loading state
  document.getElementById('viewedCount').textContent = 'Loading...';
  
  // Initial load
  loadData();
  
  // Setup auto-refresh
  setInterval(loadData, 2000);
  
  // Setup refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    document.getElementById('refreshBtn').textContent = 'Refreshing...';
    loadData().then(() => {
      document.getElementById('refreshBtn').textContent = 'Refresh Data';
    });
  });
  
  // Setup clear button
  document.getElementById('clearBtn').addEventListener('click', async () => {
    try {
      document.getElementById('clearBtn').textContent = 'Clearing...';
      await chrome.storage.local.clear();
      addLogEntry('Storage cleared successfully');
      await loadData();
      document.getElementById('clearBtn').textContent = 'Clear Storage';
    } catch (err) {
      addLogEntry(`Error clearing storage: ${err.message}`, true);
      document.getElementById('clearBtn').textContent = 'Clear Failed';
    }
  });
  
  // Setup charts after a short delay
  setTimeout(setupCharts, 500);
});

// Simplified loading function with better error handling
async function loadData() {
  try {
    // Log attempt
    console.log('Loading data from storage...');
    
    // Get all data at once
    const data = await chrome.storage.local.get(null);
    console.log('Storage data received:', data);
    
    // Handle viewed listings
    const viewedListings = data.viewedListings || [];
    const viewedCount = viewedListings.length;
    document.getElementById('viewedCount').textContent = viewedCount;
    
    // Handle stats
    const stats = data.stats || {
      pageLoads: 0,
      markingAttempts: 0,
      itemsFound: 0,
      itemsMarked: 0,
      storageOps: 0,
      errors: 0,
      lastUpdate: 0
    };
    
    // Update all stat elements
    document.getElementById('pageLoads').textContent = stats.pageLoads;
    document.getElementById('markingAttempts').textContent = stats.markingAttempts;
    document.getElementById('itemsFound').textContent = stats.itemsFound;
    document.getElementById('itemsMarked').textContent = stats.itemsMarked;
    document.getElementById('storageOps').textContent = stats.storageOps;
    document.getElementById('errors').textContent = stats.errors;
    
    // Format the last update time nicely
    const lastUpdate = stats.lastUpdate 
      ? new Date(stats.lastUpdate).toLocaleTimeString() 
      : 'Never';
    document.getElementById('lastUpdate').textContent = lastUpdate;
    
    // Add to history for charts
    if (typeof window.statsHistory === 'undefined') {
      window.statsHistory = [];
    }
    
    window.statsHistory.push({
      timestamp: new Date(),
      viewedCount,
      ...stats
    });
    
    // Keep history manageable
    if (window.statsHistory.length > 50) {
      window.statsHistory.shift();
    }
    
    // Update charts if they exist
    if (window.viewedChart && window.operationsChart) {
      updateCharts();
    }
    
    // Also load logs
    await loadLogs()
    
    // Log success
    addLogEntry(`Data updated: ${viewedCount} items viewed`);
    return true;
  } catch (err) {
    console.error('Error loading data:', err);
    addLogEntry(`Error loading data: ${err.message}`, true);
    return false;
  }
}

// Add this function to your stats.js script
async function loadLogs() {
  try {
    const result = await chrome.storage.local.get('mmLogs')
    const logs = result.mmLogs || []
    
    const logEl = document.getElementById('log')
    logEl.innerHTML = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      return `<div class="log-entry">[${time}] ${log.message}</div>`
    }).join('') || '<div class="log-entry">No logs found</div>'
    
  } catch (err) {
    console.error('Error loading logs:', err)
    document.getElementById('log').innerHTML = `<div class="log-entry error">Error loading logs: ${err.message}</div>`
  }
}

// Other functions remain the same 