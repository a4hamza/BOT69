/**
 * VIRUZ Group Metadata Cache & In-Flight Request Deduplicator
 * Drastically reduces socket network calls to WhatsApp servers by caching group metadata
 * for 3 minutes and collapsing concurrent requests for the same group into a single call.
 * Eliminates high CPU usage, socket queue congestion, and container hangs on HYEHOST.
 */

class GroupMetadataCache {
  constructor() {
    this.cache = new Map();   // groupId -> { metadata, timestamp }
    this.pending = new Map(); // groupId -> Promise<metadata>
    this.ttlMs = 180000;      // 3 minutes TTL
  }

  /**
   * Get group metadata, using cache or fetching if expired / not present
   * @param {object} sock - Baileys socket
   * @param {string} groupId - Group JID (@g.us)
   * @param {boolean} forceFresh - Force network fetch
   * @returns {Promise<object|null>}
   */
  async getGroupMetadata(sock, groupId, forceFresh = false) {
    if (!groupId || !groupId.endsWith('@g.us')) return null;
    if (!sock || typeof sock.groupMetadata !== 'function') return null;

    const now = Date.now();
    const cached = this.cache.get(groupId);

    if (!forceFresh && cached && (now - cached.timestamp < this.ttlMs)) {
      return cached.metadata;
    }

    // Deduplicate concurrent requests for the same group
    if (this.pending.has(groupId)) {
      return this.pending.get(groupId);
    }

    const fetchPromise = (async () => {
      try {
        const metadata = await sock.groupMetadata(groupId);
        if (metadata) {
          this.set(groupId, metadata);
        }
        return metadata;
      } catch (err) {
        // If network request fails, return stale cache if available
        if (cached?.metadata) return cached.metadata;
        return null;
      } finally {
        this.pending.delete(groupId);
      }
    })();

    this.pending.set(groupId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Update or pre-warm cache directly from Baileys events (e.g. groupFetchAllParticipating)
   * @param {string} groupId
   * @param {object} metadata
   */
  set(groupId, metadata) {
    if (!groupId || !metadata) return;
    const existing = this.cache.get(groupId);

    // If incoming metadata lacks participants but existing cache already has participants, merge without wiping
    if (!Array.isArray(metadata.participants) && existing?.metadata?.participants) {
      Object.assign(existing.metadata, metadata);
      existing.timestamp = Date.now();
      return;
    }

    this.cache.set(groupId, { metadata, timestamp: Date.now() });
    try {
      const welcomeHandler = require('./welcomeHandler');
      welcomeHandler.cacheGroupMetadata(groupId, metadata);
      const antiDelete = require('./antiDelete');
      antiDelete.cacheGroupMetadata(groupId, metadata);
    } catch (e) {}
  }

  /**
   * Invalidate cache on participant change (add, kick, leave, promote, demote)
   * @param {string} groupId
   */
  invalidate(groupId) {
    if (groupId) {
      this.cache.delete(groupId);
      this.pending.delete(groupId);
    }
  }

  /**
   * Flush entire cache
   */
  flush() {
    this.cache.clear();
    this.pending.clear();
  }
}

module.exports = new GroupMetadataCache();
