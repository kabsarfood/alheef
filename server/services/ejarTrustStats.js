const siteAnalyticsRepo = require('../repositories/siteAnalyticsRepo');
const ejarReviewTokensRepo = require('../repositories/ejarReviewTokensRepo');
const ejarReviewsRepo = require('../repositories/ejarReviewsRepo');
const { getCompletedContractsBase } = require('../utils/ejarReviewConfig');

const CACHE_MS = 45000;
let cache = { at: 0, value: null };

async function getEjarTrustStats() {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_MS) return cache.value;

  const [visitors, completedFromSystem, reviews] = await Promise.all([
    siteAnalyticsRepo.countEjarUniqueVisitorsAllTime(),
    ejarReviewTokensRepo.countDistinctCompletedRequests(),
    ejarReviewsRepo.getApprovedRatingStats(),
  ]);

  const contractsBase = getCompletedContractsBase();
  const value = {
    visitors: visitors || 0,
    contracts: contractsBase + (completedFromSystem || 0),
    contractsBase,
    reviewsCount: reviews.count || 0,
    reviewsAverage: reviews.average || 0,
  };

  cache = { at: now, value };
  return value;
}

module.exports = { getEjarTrustStats };
