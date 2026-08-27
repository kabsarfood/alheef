const siteAnalyticsRepo = require('../repositories/siteAnalyticsRepo');
const ejarReviewTokensRepo = require('../repositories/ejarReviewTokensRepo');
const ejarReviewsRepo = require('../repositories/ejarReviewsRepo');
const {
  getCompletedContractsBase,
  getVisitorsBase,
  getReviewsBase,
} = require('../utils/ejarReviewConfig');

const CACHE_MS = 45000;
let cache = { at: 0, value: null };

async function getEjarTrustStats() {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_MS) return cache.value;

  const [trackedVisitors, completedFromSystem, reviews] = await Promise.all([
    siteAnalyticsRepo.countPlatformUniqueVisitorsAllTime(),
    ejarReviewTokensRepo.countDistinctCompletedRequests(),
    ejarReviewsRepo.getApprovedRatingStats(),
  ]);

  const contractsBase = getCompletedContractsBase();
  const visitorsBase = getVisitorsBase();
  const reviewsBase = getReviewsBase();
  const value = {
    visitors: visitorsBase + (trackedVisitors || 0),
    visitorsBase,
    contracts: contractsBase + (completedFromSystem || 0),
    contractsBase,
    reviewsCount: reviewsBase + (reviews.count || 0),
    reviewsAverage: reviews.average || 0,
  };

  cache = { at: now, value };
  return value;
}

module.exports = { getEjarTrustStats };
