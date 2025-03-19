// simple background script to enable inspection
chrome.runtime.onInstalled.addListener(() => {
  console.log('MarketMind installed')
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => 
  {
  if (message.action === 'updateStats') {
    // Update storage with latest stats
    chrome.storage.local.set({
      currentStats: message
    }).catch(console.error);
  }
  return true;
}); 