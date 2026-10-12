import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BucketWorkspaceOverlay } from "../BucketWorkspaceOverlay";

beforeAll(() => { (globalThis as { React?: typeof React }).React = React; });
afterAll(() => { delete (globalThis as { React?: typeof React }).React; });

describe("in-place bucket opener", () => {
  it("does not mount or load a bucket when no file was selected", () => {
    expect(BucketWorkspaceOverlay({ bucketId: null, onClose: () => undefined })).toBeNull();
  });

  it("loads the exact bucket in a closable existing overlay, not a navigation link", () => {
    const onClose = () => undefined;
    const tree = BucketWorkspaceOverlay({ bucketId: "bucket-a", onClose })!;
    expect(tree.key).toBe("bucket-a");
    const suspense = tree.props.children;
    expect(suspense.props.children.props).toEqual({ embeddedBucketId: "bucket-a", onClose });
    expect(suspense.props.fallback.props.onClose).toBe(onClose);
    expect(suspense.props.fallback.props.title).toBe("Opening bucket");
    expect(suspense.props.fallback.props.open).toBe(true);
    expect(suspense.props.fallback.props.fullscreen).toBe(true);
    const html = renderToStaticMarkup(createElement(BucketWorkspaceOverlay, { bucketId: "bucket-a", onClose }));
    // Client-only portal layers must not leak an overlay into server markup.
    expect(html).toContain("hidden");
    expect(html).not.toContain("href=");
  });
});
