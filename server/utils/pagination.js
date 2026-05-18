function parsePagination(query, defaults = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit || 12));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginatedResponse(items, total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = { parsePagination, paginatedResponse };
