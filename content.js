class MarketMind {
  constructor() {
    this.viewedListings = new Set()
    this.init()
  }

  async init() {
    // load viewed listings from storage
    const stored = await chrome.storage.local.get('viewedListings')
    if (stored.viewedListings) this.viewedListings = new Set(stored.viewedListings)
    
    this.observeListings()
    this.markViewedListings()
    this.attachListeners()
  }

  observeListings() {
    // observe dom changes to handle dynamically loaded content
    const observer = new MutationObserver(() => this.markViewedListings())
    observer.observe(document.body, { childList: true, subtree: true })
  }

  markViewedListings() {
    // find all listing cards
    const listings = document.querySelectorAll('a[href*="/marketplace/item/"]')
    
    listings.forEach(listing => {
      const id = this.getListingId(listing.href)
      if (this.viewedListings.has(id)) listing.classList.add('mm-viewed')
      
      listing.addEventListener('click', () => this.markAsViewed(id, listing))
    })
  }

  getListingId(url) {
    return url.split('/marketplace/item/')[1]?.split('/')[0]
  }

  async markAsViewed(id, element) {
    this.viewedListings.add(id)
    element.classList.add('mm-viewed')
    
    // save to storage
    await chrome.storage.local.set({
      viewedListings: Array.from(this.viewedListings)
    })
  }

  attachListeners() {
    // handle navigation and dynamic content loading
    window.addEventListener('popstate', () => this.markViewedListings())
  }
}

new MarketMind() 