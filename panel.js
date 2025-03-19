// Update the counts
function updateCounts(viewedCount, foundItems) {
  document.getElementById('viewedCount').textContent = `Viewed: ${viewedCount}`;
  document.getElementById('foundItems').textContent = `Found: ${foundItems}`;
}

// Add button listeners
document.getElementById('viewBtn').addEventListener('click', () => {
  parent.postMessage({action:'view'}, '*');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  parent.postMessage({action:'clear'}, '*');
});

document.getElementById('statsBtn').addEventListener('click', () => {
  const extensionId = chrome.runtime.id;
  window.open(`chrome-extension://${extensionId}/stats.html`, '_blank');
});

// Listen for updates from parent
window.addEventListener('message', event => {
  if (event.data.type === 'update') {
    updateCounts(event.data.viewedCount, event.data.foundItems);
  }

  
}); 