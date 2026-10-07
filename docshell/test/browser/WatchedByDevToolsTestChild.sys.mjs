/**
 * JS Process Actor to check if BrowsingContext are flagged with watchedByDevTools
 * at the earliest possible event, initial-document-element-inserted.
 *
 * (JS Window Actor are created too late and can't receive this event)
 */
export class WatchedByDevToolsTestChild extends JSProcessActorChild {
  actorCreated() {
    this.watched = new Set();
  }
  receiveMessage(msg) {
    switch (msg.name) {
      case "wasWatchedEarly":
        return this.watched.has(msg.data.browsingContextId);
    }
    return null;
  }

  observe = async (subject, topic) => {
    if (topic != "initial-document-element-inserted") {
      return;
    }
    const window = subject?.defaultView;
    if (!window) {
      return;
    }
    if (!window.browsingContext.watchedByDevTools) {
      return;
    }
    this.watched.add(window.browsingContext.id);
  };
}
