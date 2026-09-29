"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Users, Briefcase, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

interface Company {
  id: string;
  code: string;
  name: string;
}
interface Department {
  id: string;
  code: string;
  name: string;
}
interface Designation {
  id: string;
  name: string;
  isCompanyHead?: boolean;
}

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  // If already complete, redirect immediately
  useEffect(() => {
    if (session?.user?.profileComplete) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState<string>("");
  const [isCompanyHead, setIsCompanyHead] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingDesigs, setLoadingDesigs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load companies on mount
  useEffect(() => {
    fetch("/api/orgs")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setCompanies(d.data.companies); })
      .catch(() => null);
  }, []);

  // Load designations when company changes
  async function handleCompanySelect(company: Company) {
    setSelectedCompany(company);
    setSelectedDesignation("");
    setIsCompanyHead(false);
    setSelectedDept(null);
    setDesignations([]);
    setDepartments([]);
    setLoadingDesigs(true);
    try {
      const r = await fetch(`/api/orgs/designations?companyId=${company.id}`);
      const d = await r.json();
      if (d.ok) setDesignations(d.data);
    } finally {
      setLoadingDesigs(false);
    }
    setStep(2);
  }

  // Load departments when designation changes (skipped entirely for Company Head)
  async function handleDesignationSelect(designation: Designation) {
    setSelectedDesignation(designation.name);
    setIsCompanyHead(Boolean(designation.isCompanyHead));
    setSelectedDept(null);

    if (designation.isCompanyHead) {
      // Company Heads have no single department — skip step 3 entirely.
      return;
    }

    setDepartments([]);
    setLoadingDepts(true);
    try {
      const r = await fetch(`/api/orgs/departments?companyId=${selectedCompany!.id}`);
      const d = await r.json();
      if (d.ok) setDepartments(d.data);
    } finally {
      setLoadingDepts(false);
    }
    setStep(3);
  }

  async function handleSubmit() {
    if (!selectedCompany || !selectedDesignation) return;
    if (!isCompanyHead && !selectedDept) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          departmentId: isCompanyHead ? null : selectedDept!.id,
          designation: selectedDesignation,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Setup failed. Please try again.");
        return;
      }
      // Refresh JWT so middleware sees profileComplete=true
      await update({
        profileComplete: true,
        companyId: selectedCompany.id,
        departmentId: isCompanyHead ? null : selectedDept!.id,
        designation: selectedDesignation,
      });
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabels = [
    { num: 1, label: "Company",     icon: Building2 },
    { num: 2, label: "Designation", icon: Briefcase },
    { num: 3, label: "Department",  icon: Users },
  ];

  const canSubmit = Boolean(selectedDesignation && (isCompanyHead || selectedDept));

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#0b1120] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome to FormFlow</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Hello{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}! Set up your organisation profile to get started.
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map(({ num, label, icon: Icon }, i) => {
            const done = step > num || (num === 3 && isCompanyHead && step >= 2 && selectedDesignation !== "");
            const active = step === num && !(num === 3 && isCompanyHead);
            return (
              <div key={num} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    done  ? "bg-orange-500 border-orange-500"
                         : active ? "border-orange-500 bg-white dark:bg-card"
                         : "border-slate-200 dark:border-border bg-white dark:bg-card"
                  }`}>
                    {done
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : <Icon className={`w-4 h-4 ${active ? "text-orange-500" : "text-slate-400 dark:text-slate-500"}`} />
                    }
                  </div>
                  <span className={`text-[10px] font-semibold ${active ? "text-orange-600 dark:text-orange-400" : done ? "text-slate-600 dark:text-slate-400" : "text-slate-400 dark:text-slate-600"}`}>
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`w-12 h-0.5 mb-4 ${step > num ? "bg-orange-400" : "bg-slate-200 dark:bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl shadow-card dark:shadow-none overflow-hidden">

          {/* Step 1: Company */}
          {step >= 1 && (
            <div className={step === 1 ? "" : "border-b border-black/6 dark:border-border"}>
              <div className="px-6 pt-5 pb-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedCompany ? "bg-orange-50 dark:bg-orange-500/15" : "bg-slate-50 dark:bg-muted/60"}`}>
                  <Building2 className={`w-4 h-4 ${selectedCompany ? "text-orange-500" : "text-slate-400"}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Step 1</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Select your Company</p>
                </div>
                {selectedCompany && step > 1 && (
                  <button
                    onClick={() => { setStep(1); setSelectedDesignation(""); setSelectedDept(null); }}
                    className="ml-auto text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 font-semibold"
                  >
                    Change
                  </button>
                )}
              </div>

              {step === 1 ? (
                <div className="px-6 pb-5 grid grid-cols-1 gap-2">
                  {companies.length === 0 && (
                    <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">Loading companies...</p>
                  )}
                  {companies.map((co) => (
                    <button
                      key={co.id}
                      onClick={() => handleCompanySelect(co)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-black/8 dark:border-border text-left transition-all hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-500/10 group"
                    >
                      <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-muted flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 group-hover:bg-orange-100 dark:group-hover:bg-orange-500/20 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        {co.code.slice(0, 2)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm group-hover:text-orange-700 dark:group-hover:text-orange-300">{co.name}</p>
                        <p className="text-xs text-slate-400">{co.code}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-orange-400 transition-colors" />
                    </button>
                  ))}
                </div>
              ) : selectedCompany ? (
                <div className="px-6 pb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-sm font-semibold text-orange-700 dark:text-orange-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {selectedCompany.name}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 2: Designation */}
          {step >= 2 && (
            <div className={step === 2 ? "" : "border-b border-black/6 dark:border-border"}>
              <div className="px-6 pt-5 pb-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedDesignation ? "bg-orange-50 dark:bg-orange-500/15" : "bg-slate-50 dark:bg-muted/60"}`}>
                  <Briefcase className={`w-4 h-4 ${selectedDesignation ? "text-orange-500" : "text-slate-400"}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Step 2</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Select your Designation</p>
                </div>
                {selectedDesignation && step > 2 && (
                  <button
                    onClick={() => { setStep(2); setSelectedDept(null); }}
                    className="ml-auto text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 font-semibold"
                  >
                    Change
                  </button>
                )}
              </div>

              {step === 2 ? (
                <div className="px-6 pb-5">
                  {loadingDesigs ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading designations...</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {designations.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleDesignationSelect(d)}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                            selectedDesignation === d.name
                              ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                              : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-400"
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : selectedDesignation ? (
                <div className="px-6 pb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-sm font-semibold text-orange-700 dark:text-orange-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {selectedDesignation}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Department — skipped entirely for Company Head designations */}
          {step >= 2 && isCompanyHead ? (
            <div className="px-6 py-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Department:</span> Not applicable (Company Head)
              </p>
              {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="mt-4 w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <>Complete Setup <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          ) : step >= 3 && (
            <div>
              <div className="px-6 pt-5 pb-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedDept ? "bg-orange-50 dark:bg-orange-500/15" : "bg-slate-50 dark:bg-muted/60"}`}>
                  <Users className={`w-4 h-4 ${selectedDept ? "text-orange-500" : "text-slate-400"}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Step 3</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Select your Department</p>
                </div>
              </div>

              <div className="px-6 pb-5">
                {loadingDepts ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading departments...</span>
                  </div>
                ) : departments.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No departments available for this company.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {departments.map((dept) => (
                      <button
                        key={dept.id}
                        onClick={() => setSelectedDept(dept)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all group ${
                          selectedDept?.id === dept.id
                            ? "border-orange-400 bg-orange-50/60 dark:bg-orange-500/10 dark:border-orange-500/50"
                            : "border-black/8 dark:border-border hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-500/10"
                        }`}
                      >
                        <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-muted flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 group-hover:bg-orange-100 dark:group-hover:bg-orange-500/20 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                          {dept.code.slice(0, 3)}
                        </span>
                        <p className="flex-1 font-semibold text-slate-800 dark:text-slate-200 text-sm group-hover:text-orange-700 dark:group-hover:text-orange-300">{dept.name}</p>
                        {selectedDept?.id === dept.id && <CheckCircle2 className="w-4 h-4 text-orange-500" />}
                      </button>
                    ))}
                  </div>
                )}

                {error && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="mt-5 w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <>Complete Setup <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">
          You can change these settings at any time from your profile Settings page.
        </p>
      </div>
    </div>
  );
}
