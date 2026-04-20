function buildNodeRegistry(config) {
  const selfUrl = config.nodeUrl;
  const allNodeUrls = config.nodeRegistry || [];

  function getReplicaCandidates(excludedUrls = []) {
    const excludedSet = new Set([selfUrl, ...excludedUrls].filter(Boolean));
    return allNodeUrls.filter((url) => !excludedSet.has(url));
  }

  function pickReplicaNode(excludedUrls = []) {
    const candidates = getReplicaCandidates(excludedUrls);
    return candidates.length > 0 ? candidates[0] : null;
  }

  return {
    selfUrl,
    allNodeUrls,
    getReplicaCandidates,
    pickReplicaNode,
  };
}

module.exports = {
  buildNodeRegistry,
};
