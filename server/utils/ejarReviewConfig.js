function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = {
  getReviewLinkExpiryDays() {
    return intEnv('EJAR_REVIEW_LINK_EXPIRY_DAYS', 30);
  },
  getMinReviewsToDisplay() {
    return intEnv('EJAR_REVIEWS_MIN_TO_DISPLAY', 10);
  },
  getMaxCommentLength() {
    return intEnv('EJAR_REVIEW_MAX_COMMENT', 1000);
  },
  getSiteUrl() {
    return (process.env.SITE_URL || 'https://www.alheef.website').replace(/\/$/, '');
  },
  getCompletedContractsBase() {
    return intEnv('EJAR_COMPLETED_CONTRACTS_BASE', 200);
  },
};
