"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DesignationMultiSelect } from "./designation-multi-select";

interface OrgData {
  companies: { id: string; code: string; name: string }[];
  departments: { id: string; code: string; name: string }[];
}

interface AudienceConfig {
  companies: string[];
  departments: string[];
  designations: string[];
  adGroups: string[];
}

interface AudiencePanelProps {
  formId: string;
}

export function AudiencePanel({ formId }: AudiencePanelProps) {
  const [orgs, setOrgs] = useState<OrgData>({ companies: [], departments: [] });
  const [audience, setAudience] = useState<AudienceConfig>({
    companies: [],
    departments: [],
    designations: [],
    adGroups: [],
  });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [designationOptions, setDesignationOptions] = useState<string[]>([]);
  const [adGroupInput, setAdGroupInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/orgs").then((r) => r.json()),
      fetch(`/api/forms/${formId}/audience`).then((r) => r.json()),
      // No companyId -> every active designation across all companies, which is
      // what an audience rule needs (it is not scoped to one company).
      fetch("/api/orgs/designations").then((r) => r.json()),
    ]).then(([orgsRes, audRes, desigRes]) => {
      if (orgsRes.ok) setOrgs(orgsRes.data);
      if (desigRes.ok) {
        setDesignationOptions((desigRes.data as { name: string }[]).map((d) => d.name));
      }
      if (audRes.ok && audRes.data) {
        setAudience({
          companies: audRes.data.companies ?? [],
          departments: audRes.data.departments ?? [],
          designations: audRes.data.designations ?? [],
          adGroups: audRes.data.adGroups ?? [],
        });
      }
      setLoaded(true);
    });
  }, [formId]);

  const saveAudience = useCallback(
    async (updated: AudienceConfig) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/forms/${formId}/audience`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error("save failed");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [formId]
  );

  function toggleItem(field: "companies" | "departments", id: string) {
    const current = audience[field];
    const updated = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    const newAudience = { ...audience, [field]: updated };
    setAudience(newAudience);
    saveAudience(newAudience);
  }

  function addTag(field: "designations" | "adGroups", value: string) {
    const trimmed = value.trim();
    if (!trimmed || audience[field].includes(trimmed)) return;
    const newAudience = { ...audience, [field]: [...audience[field], trimmed] };
    setAudience(newAudience);
    saveAudience(newAudience);
  }

  function removeTag(field: "designations" | "adGroups", value: string) {
    const newAudience = {
      ...audience,
      [field]: audience[field].filter((x) => x !== value),
    };
    setAudience(newAudience);
    saveAudience(newAudience);
  }

  if (!loaded) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-[#0b1120]">
        <p className="text-sm text-slate-400">Loading audience settings...</p>
      </div>
    );
  }

  const emptiesNotice =
    audience.companies.length === 0 &&
    audience.departments.length === 0 &&
    audience.designations.length === 0 &&
    audience.adGroups.length === 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-[#0b1120] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Audience Targeting</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Restrict who can see and fill this form. Empty = visible to everyone.
          </p>
        </div>
        <span
          className={`text-xs ${
            saveState === "saved"
              ? "text-green-600"
              : saveState === "saving"
                ? "text-slate-400 animate-pulse"
                : "text-red-500"
          }`}
        >
          {saveState === "saved" && "✓ Saved"}
          {saveState === "saving" && "Saving..."}
          {saveState === "error" && "Save failed"}
        </span>
      </div>

      {emptiesNotice && (
        <div className="rounded-lg px-3 py-2 text-xs bg-orange-50 border border-orange-200 text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/25 dark:text-orange-300">
          No restrictions set — this form is visible to all active users.
        </div>
      )}

      {/* Companies */}
      <section className="bg-white rounded-xl border border-black/8 p-4 space-y-3 dark:bg-card dark:border-border">
        <Label className="text-sm font-semibold text-slate-800 dark:text-white">Companies</Label>
        <p className="text-xs text-slate-400">Leave empty to allow all companies.</p>
        <div className="grid grid-cols-2 gap-2">
          {orgs.companies.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={audience.companies.includes(c.id)}
                onChange={() => toggleItem("companies", c.id)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
              <span className="text-slate-400 text-xs">({c.code})</span>
            </label>
          ))}
          {orgs.companies.length === 0 && (
            <p className="text-xs text-slate-400 col-span-2">No companies found.</p>
          )}
        </div>
      </section>

      {/* Departments */}
      <section className="bg-white rounded-xl border border-black/8 p-4 space-y-3 dark:bg-card dark:border-border">
        <Label className="text-sm font-semibold text-slate-800 dark:text-white">Departments</Label>
        <p className="text-xs text-slate-400">Leave empty to allow all departments.</p>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {orgs.departments.map((d) => (
            <label
              key={d.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={audience.departments.includes(d.id)}
                onChange={() => toggleItem("departments", d.id)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-slate-700">{d.name}</span>
            </label>
          ))}
          {orgs.departments.length === 0 && (
            <p className="text-xs text-slate-400 col-span-2">No departments found.</p>
          )}
        </div>
      </section>

      {/* Designations */}
      <section className="bg-white rounded-xl border border-black/8 p-4 space-y-3 dark:bg-card dark:border-border">
        <Label className="text-sm font-semibold text-slate-800 dark:text-white">Designations</Label>
        <p className="text-xs text-slate-400">
          Pick from the designation list. Leave empty to allow all.
        </p>
        <DesignationMultiSelect
          options={designationOptions}
          selected={audience.designations}
          onChange={(next) => {
            const newAudience = { ...audience, designations: next };
            setAudience(newAudience);
            saveAudience(newAudience);
          }}
        />
      </section>

      {/* AD Groups */}
      <section className="bg-white rounded-xl border border-black/8 p-4 space-y-3 dark:bg-card dark:border-border">
        <Label className="text-sm font-semibold text-slate-800 dark:text-white">AD Groups</Label>
        <p className="text-xs text-slate-400">
          Restrict to specific Active Directory groups. Leave empty to allow all.
        </p>
        <div className="flex gap-2">
          <Input
            value={adGroupInput}
            onChange={(e) => setAdGroupInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag("adGroups", adGroupInput);
                setAdGroupInput("");
              }
            }}
            placeholder="e.g. FormFlow-IT-Users"
            className="text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addTag("adGroups", adGroupInput);
              setAdGroupInput("");
            }}
          >
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {audience.adGroups.map((g) => (
            <span
              key={g}
              className="flex items-center gap-1 bg-violet-50 text-violet-700 text-xs px-2 py-0.5 rounded-full border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25"
            >
              {g}
              <button
                onClick={() => removeTag("adGroups", g)}
                className="hover:text-violet-900 ml-0.5"
                aria-label={`Remove ${g}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
