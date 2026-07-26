"use client";

import { useMemo, useState } from "react";
import type { Album } from "@/app/lib/store";
import {
  suggestAlbumMetadata,
  type MetadataField,
  type MetadataProposal,
  type MetadataSource,
  type MetadataSuggestion,
} from "@/app/lib/metadata";

type MetadataUpdaterProps = {
  album: Album;
  onApply: (proposal: MetadataProposal) => void;
};

const FIELD_CONFIG: Array<{ key: MetadataField; label: string }> = [
  { key: "title", label: "专辑名" },
  { key: "artist", label: "艺人" },
  { key: "edition", label: "版本说明" },
  { key: "releaseDate", label: "发行日期" },
  { key: "year", label: "发行年份" },
  { key: "label", label: "厂牌" },
  { key: "country", label: "发行国家" },
  { key: "catalogNumber", label: "编目号" },
  { key: "barcode", label: "条形码" },
  { key: "genres", label: "流派" },
  { key: "styles", label: "风格" },
  { key: "producers", label: "制作人" },
  { key: "tracklist", label: "曲目" },
];

const SOURCE_LABELS: Record<MetadataSource, string> = {
  apple: "Apple 中国区",
  musicbrainz: "MusicBrainz",
  discogs: "Discogs",
  wikidata: "Wikidata",
  opencc: "简繁规范",
};

function rawValue(album: Album, field: MetadataField) {
  return album[field];
}

function comparable(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join("\n");
  }
  return value === undefined || value === null ? "" : String(value).trim();
}

function displayValue(value: unknown, field: MetadataField) {
  if (Array.isArray(value)) {
    if (field === "tracklist") {
      return value.length > 0 ? `${value.length} 首曲目` : "未填写";
    }
    return value.join("、") || "未填写";
  }
  return comparable(value) || "未填写";
}

export function MetadataUpdater({
  album,
  onApply,
}: MetadataUpdaterProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<MetadataSuggestion | null>(null);
  const [suggestionFor, setSuggestionFor] = useState("");
  const [selected, setSelected] = useState<Set<MetadataField>>(new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const signature = `${album.artist}\u0000${album.title}\u0000${album.year ?? ""}\u0000${album.barcode ?? ""}`;
  const visibleSuggestion =
    suggestionFor === signature ? suggestion : null;

  const differences = useMemo(() => {
    if (!visibleSuggestion) return [];
    return FIELD_CONFIG.filter(({ key }) => {
      const next = visibleSuggestion.proposal[key];
      return (
        next !== undefined &&
        comparable(rawValue(album, key)) !== comparable(next)
      );
    });
  }, [album, visibleSuggestion]);

  async function handleUpdate() {
    setLoading(true);
    setSuggestion(null);
    setSelected(new Set());
    setError("");
    setMessage("");
    try {
      const next = await suggestAlbumMetadata(album);
      const changed = FIELD_CONFIG.filter(({ key }) => {
        const value = next.proposal[key];
        return (
          value !== undefined &&
          comparable(rawValue(album, key)) !== comparable(value)
        );
      }).map(({ key }) => key);
      setSuggestion(next);
      setSuggestionFor(signature);
      setSelected(new Set(changed));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "暂时无法更新专辑信息",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleField(field: MetadataField) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function applySelection() {
    if (!visibleSuggestion || selected.size === 0) return;
    const proposal: MetadataProposal = {};
    for (const field of selected) {
      const value = visibleSuggestion.proposal[field];
      if (value !== undefined) proposal[field] = value as never;
    }
    onApply(proposal);
    setSuggestion(null);
    setSelected(new Set());
    setMessage("已写入表单，封面保持不变；你仍可以继续手改");
  }

  const confidenceLabel =
    visibleSuggestion?.confidence === "high"
      ? "高匹配"
      : visibleSuggestion?.confidence === "medium"
        ? "较高匹配"
        : "需要确认";

  return (
    <section className="metadata-updater" aria-label="更新专辑信息">
      <div className="metadata-updater-heading">
        <div>
          <strong>专辑信息</strong>
          <span>从多个来源找出最佳匹配，采用前不会改动表单</span>
        </div>
        <button
          type="button"
          className="metadata-update-trigger"
          onClick={() => void handleUpdate()}
          disabled={loading}
        >
          {loading ? "正在匹配…" : "更新专辑信息"}
        </button>
      </div>

      {loading && (
        <div className="metadata-loading" role="status">
          <span aria-hidden="true" />
          正在核对 Apple 中国区、MusicBrainz、Discogs 和 Wikidata…
        </div>
      )}

      {error && (
        <p className="metadata-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="metadata-applied" role="status">
          {message}
        </p>
      )}

      {visibleSuggestion && (
        <div className="metadata-review">
          <div className="metadata-review-summary">
            <div>
              <span
                className={`metadata-confidence is-${visibleSuggestion.confidence}`}
              >
                {confidenceLabel}
              </span>
              <strong>{visibleSuggestion.summary}</strong>
            </div>
            <div className="metadata-source-states" aria-label="数据源状态">
              {visibleSuggestion.sourceStates.map((source) => (
                <span
                  key={source.source}
                  className={`metadata-source-state is-${source.status}`}
                  title={
                    source.status === "matched"
                      ? "已找到匹配"
                      : source.status === "no-match"
                        ? "没有可靠匹配"
                        : "本次暂不可用"
                  }
                >
                  {source.label}
                </span>
              ))}
            </div>
          </div>

          {differences.length > 0 ? (
            <>
              <div className="metadata-diff-list">
                {differences.map(({ key, label }) => {
                  const next = visibleSuggestion.proposal[key];
                  const sources = visibleSuggestion.provenance[key] ?? [];
                  return (
                    <label key={key} className="metadata-diff-row">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleField(key)}
                      />
                      <span className="metadata-diff-label">{label}</span>
                      <span className="metadata-diff-values">
                        <s>{displayValue(rawValue(album, key), key)}</s>
                        <span aria-hidden="true">→</span>
                        <strong>{displayValue(next, key)}</strong>
                      </span>
                      <span className="metadata-field-sources">
                        {sources.map((source) => (
                          <span key={source}>{SOURCE_LABELS[source]}</span>
                        ))}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="metadata-review-actions">
                <button
                  type="button"
                  className="metadata-apply"
                  onClick={applySelection}
                  disabled={selected.size === 0}
                >
                  采用选中的 {selected.size} 项
                </button>
                <button
                  type="button"
                  className="metadata-dismiss"
                  onClick={() => setSuggestion(null)}
                >
                  暂不采用
                </button>
              </div>
            </>
          ) : (
            <div className="metadata-no-change">
              当前信息已经与最佳匹配一致，没有需要替换的字段。
            </div>
          )}
        </div>
      )}
    </section>
  );
}
