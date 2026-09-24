/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * CollectorLogAnalyzer provides an API for analyzing Firefox's Garbage
 * Collector (GC) and Cycle Collector (CC) log files. These logs capture
 * a snapshot of the memory graph at cycle collection time, recording nodes
 * (objects) and edges (references between objects).
 *
 * This API enables investigation of memory leaks by allowing callers to:
 * - Search for nodes by label or address
 * - Find paths from any node back to a GC/CC root
 * - Explore the edges to and from any node
 *
 * The analyzer parses CC logs (which track reference-counted C++ objects
 * and their pointers to GC-managed JS objects) and GC logs (which track
 * JavaScript heap objects). When both logs are provided, they are merged
 * into a unified graph for analysis.
 *
 * Used by about:memory to provide an interactive UI for memory debugging.
 */

interface nsIFile;

/**
 * The result of searching for a path to root.
 * - "none": No path to any root was found. The node may be garbage.
 * - "soft": Only a path through soft/gray roots was found.
 * - "hard": A path to a strong root was found.
 */
enum CollectorLogRootKind {
  "none",
  "soft",
  "hard",
};

/**
 * Flags describing the state of a node in the collector graph.
 * Multiple flags may be combined on a single node.
 */
[ChromeOnly, Exposed=(Window)]
namespace CollectorNodeFlags {
  /** Node was identified as garbage and unlinked during cycle collection. */
  const octet GARBAGE = 0x01;

  /**
   * Node was logged as an "IncrementalRoot" in the CC log. These are pointers
   * held by the cycle collector that were added during an incremental CC, and
   * act as additional roots to prevent prematurely freeing objects touched
   * mid-collection. Currently tracked but not used in path-finding.
   */
  const octet INCREMENTAL_ROOT = 0x02;

  /**
   * Node is a root that keeps reachable objects alive. For GC nodes, this
   * means it appeared in the GC log's roots section. For CC nodes, this means
   * its reference count exceeds the number of incoming edges observed in the
   * CC log alone. A node with ROOT but not SOFT_ROOT is a "hard" root - it
   * has unaccounted-for references even when considering both logs combined.
   */
  const octet ROOT = 0x04;

  /**
   * Node is a "soft" root - a root from one collector's perspective that is
   * not a true root in the combined GC+CC graph. For GC nodes, this indicates
   * a gray root (pointers from C++ prevent release, but the C++ objects may
   * themselves be traced via the CC log). For CC nodes, this indicates its
   * reference count is fully accounted for once edges from both CC and GC
   * logs are considered. Soft roots are used as path-finding starting points
   * only when no path through hard roots exists.
   */
  const octet SOFT_ROOT = 0x08;

  /** Node is reference-counted and managed by the Cycle Collector. */
  const octet CC_MANAGED = 0x10;

  /**
   * Node was marked (gray or black) by the Garbage Collector (reachable from
   * GC roots).
   */
  const octet GC_MARKED = 0x20;

  /**
   * Node was marked gray by the GC (only reachable from gray roots).
   * NOTE: if GC_MARKED is set but not GC_GRAY, it means the node was marked
   * black by the GC.
   */
  const octet GC_GRAY = 0x40;
};

/**
 * Represents a node (object) in the GC/CC graph.
 */
dictionary CollectorLogNode {
  /** Internal index used to identify this node in subsequent API calls. */
  required unsigned long long index;

  /** Memory address of the object as a hex string (e.g., "0x7fff12345678"). */
  required UTF8String ptr;

  /** Type label describing the object (e.g., "Document", "JSObject", etc.). */
  required UTF8String label;

  /** Reference count from CC log, or -1 if not a CC-managed object. */
  required long long referenceCount;

  /** Bitmask of CollectorNodeFlags values describing this node's state. */
  required unsigned short flags;
};

/**
 * Represents a directed edge (reference) between two nodes.
 */
dictionary CollectorLogEdge {
  /** The node at the other end of this edge. */
  required CollectorLogNode other;
  /** Name of the field or relationship this edge represents. */
  required UTF8String label;
};

/**
 * Contains all edges adjacent to a node (both incoming and outgoing).
 */
dictionary CollectorLogNodeAdjacents {
  /** Edges from other nodes pointing to this node. */
  required sequence<CollectorLogEdge> toSelf;

  /** Edges from this node pointing to other nodes. */
  required sequence<CollectorLogEdge> fromSelf;
};

/**
 * Represents a path through a WeakMap that contributes to keeping an object
 * alive. WeakMaps create conditional edges: a value is only kept alive if
 * both the map and the key are alive.
 */
dictionary CollectorLogWeakMapPath {
  /** The WeakMap key node that gates this path. */
  required CollectorLogNode key;

  /** The path from a root to the WeakMap or key. */
  required sequence<CollectorLogEdge> path;
};

/**
 * Result of finding a path from a GC/CC root to a node.
 */
dictionary CollectorLogRootPath {
  /** Whether a path was found and what type of root it leads to. */
  required CollectorLogRootKind kind;

  /** The path from root to the queried node (root is first, queried node last). */
  required sequence<CollectorLogEdge> path;

  /** Additional paths through WeakMaps that contribute to keeping the node alive. */
  required sequence<CollectorLogWeakMapPath> weakMapPaths;
};

[ChromeOnly, Exposed=(Window)]
interface CollectorLogAnalyzer {
  /** Maximum number of nodes returned by queryNodes(). */
  const unsigned long MAX_QUERY_RESULTS = 500;

  /** Number of nodes returned by sampleNodes(). */
  const unsigned long SAMPLE_COUNT = 20;

  /**
   * Create an analyzer for the given log files. Either path may be empty
   * to analyze only a CC or GC log, but at least one must be provided.
   */
  constructor(DOMString ccLogPath, DOMString gcLogPath);

  /**
   * Parse and index the log files. Must be called before other methods.
   * This operation runs on a background thread; use getInitProgress()
   * to poll for completion percentage.
   */
  [Throws]
  Promise<undefined> init();

  /**
   * Returns initialization progress as a value from 0.0 to 1.0.
   */
  double getInitProgress();

  /**
   * Search for nodes matching the query string. Matches against node labels
   * (substring match) and addresses (exact hex match). Returns up to
   * MAX_QUERY_RESULTS nodes, prioritizing non-garbage nodes.
   */
  [Throws]
  Promise<sequence<CollectorLogNode>> queryNodes(UTF8String query);

  /**
   * Returns query progress as a value from 0.0 to 1.0.
   */
  double getQueryProgress();

  /**
   * Find a path from the given node back to a GC/CC root. Uses BFS to find
   * the shortest path. First searches for hard roots; if none found, searches
   * for soft/gray roots.
   */
  [Throws]
  Promise<CollectorLogRootPath> getPathToRoot(CollectorLogNode node);

  /**
   * Get all edges to and from the given node, up to MAX_QUERY_RESULTS each.
   */
  [Throws]
  Promise<CollectorLogNodeAdjacents> getNodeAdjacents(CollectorLogNode node);

  /**
   * Return a random sample of SAMPLE_COUNT non-garbage nodes. Useful for
   * exploring the graph when you don't know what to search for.
   */
  [Throws]
  Promise<sequence<CollectorLogNode>> sampleNodes();
};
