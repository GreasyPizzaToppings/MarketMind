// simple background script to enable inspection
chrome.runtime.onInstalled.addListener(() => {
  console.log('MarketMind installed')
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    // forward to any open stats pages
    chrome.runtime.sendMessage(message).catch(() => {});
  }
  return true;
}); 