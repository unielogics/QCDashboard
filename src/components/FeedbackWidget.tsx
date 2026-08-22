"use client";

// Reusable thumbs-up / thumbs-down + comment widget. Used in:
//   - Elara Inbox detail panel (output_type='ai_task')
//   - Deal Workspace AI chat bubbles (output_type='chat_reply')
// One vote per user per output (backend upserts). Counts roll up across
// all operators viewing the same task.

import { useEffect, useState } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useFeedbackForOutput, useUpsertFeedback } from "@/hooks/useApi";
import { FeedbackOutputType, FeedbackRating } from "@/lib/enums.generated";

interface Props {
  outputType: FeedbackOutputType;
  outputId: string;
  loanId?: string | null;
  // Compact = chat bubble use; full = Elara Inbox detail panel
  compact?: boolean;
}

export function FeedbackWidget({ outputType, outputId, loanId, compact = false }: Props) {
  const { data: user } = useCurrentUser();
  const { data: feedback = [] } = useFeedbackForOutput(outputType, outputId);
  const upsert = useUpsertFeedback();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  const myFeedback = user ? feedback.find((f) => f.created_by === user.id) : undefined;
  const upCount = feedback.filter((f) => f.rating === FeedbackRating.UP).length;
  const downCount = feedback.filter((f) => f.rating === FeedbackRating.DOWN).length;

  // Seed the comment field from the user's existing feedback so they can edit it.
  useEffect(() => {
    setComment(myFeedback?.comment ?? "");
  }, [myFeedback?.comment]);

  const sendVote = (rating: FeedbackRating, withComment?: string) => {
    upsert.mutate({
      output_type: outputType,
      output_id: outputId,
      loan_id: loanId ?? null,
      rating,
      comment: withComment ?? myFeedback?.comment ?? null,
    });
  };

  const saveComment = () => {
    upsert.mutate({
      output_type: outputType,
      output_id: outputId,
      loan_id: loanId ?? null,
      rating: myFeedback?.rating ?? FeedbackRating.UP,
      comment: comment.trim() || null,
    });
    setShowComment(false);
  };

  const upActive = myFeedback?.rating === FeedbackRating.UP;
  const downActive = myFeedback?.rating === FeedbackRating.DOWN;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        ...(compact ? { fontSize: 11 } : { fontSize: 12 }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ThumbButton
          icon="thumbsUp"
          active={upActive}
          activeColor={V.profit}
          onClick={() => sendVote(FeedbackRating.UP)}
          ariaLabel="Helpful"
        />
        {upCount > 0 && (
          <span style={{ color: V.ink3, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{upCount}</span>
        )}
        <ThumbButton
          icon="thumbsDown"
          active={downActive}
          activeColor={V.danger}
          onClick={() => sendVote(FeedbackRating.DOWN)}
          ariaLabel="Not helpful"
        />
        {downCount > 0 && (
          <span style={{ color: V.ink3, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{downCount}</span>
        )}
        <button
          onClick={() => setShowComment((v) => !v)}
          aria-label="Add comment"
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 7px",
            borderRadius: 6,
            color: showComment ? V.petrol : V.ink3,
            background: showComment ? V.petrolSoft : "transparent",
          }}
        >
          <Icon name="comment" size={compact ? 11 : 13} />
          {!compact && <span>Comment</span>}
        </button>
        {myFeedback?.comment && !showComment && (
          <span
            style={{
              color: V.ink3,
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: compact ? 180 : 320,
            }}
            title={myFeedback.comment}
          >
            “{myFeedback.comment}”
          </span>
        )}
      </div>
      {showComment && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Why? (optional — helps the AI learn for this loan)"
            rows={compact ? 2 : 3}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              background: V.surface2,
              border: `1px solid ${V.line}`,
              color: V.ink,
              fontSize: 12.5,
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              onClick={() => setShowComment(false)}
              style={ghostBtn()}
            >
              Cancel
            </button>
            <button
              onClick={saveComment}
              disabled={upsert.isPending}
              style={{
                ...ghostBtn(),
                background: V.ink,
                color: V.inverse,
                border: "none",
                fontWeight: 700,
              }}
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThumbButton({ icon,
  active,
  activeColor,
  onClick,
  ariaLabel,
}: {
  icon: "thumbsUp" | "thumbsDown";
  active: boolean;
  activeColor: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: 6,
        background: active ? `${activeColor}22` : "transparent",
        color: active ? activeColor : V.ink3,
      }}
    >
      <Icon name={icon} size={13} stroke={active ? 2.4 : 1.8} />
    </button>
  );
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 6,
    background: V.surface,
    border: `1px solid ${V.line}`,
    color: V.ink2,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
