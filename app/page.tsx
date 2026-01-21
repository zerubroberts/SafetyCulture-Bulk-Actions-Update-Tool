"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

type Step = "api-key" | "upload" | "mapping" | "processing" | "complete";

interface ExcelRow {
  [key: string]: string | number | undefined;
}

interface FieldMapping {
  actionId: string;
  status: string;
  notes: string;
}

interface ProcessingResult {
  actionId: string;
  success: boolean;
  message: string;
}

const STATUS_OPTIONS = [
  { id: "17e793a1-26a3-4ecd-99ca-f38ecc6eaa2e", label: "To Do" },
  { id: "20ce0cb1-387a-47d4-8c34-bc6fd3be0e27", label: "In Progress" },
  { id: "7223d809-553e-4714-a038-62dc98f3fbf3", label: "Complete" },
  { id: "06308884-41c2-4ee0-9da7-5676647d3d75", label: "Can't Do" },
];

const STEPS = [
  { key: "api-key", label: "Connect", icon: "key" },
  { key: "upload", label: "Upload", icon: "upload" },
  { key: "mapping", label: "Configure", icon: "settings" },
  { key: "processing", label: "Process", icon: "loader" },
  { key: "complete", label: "Done", icon: "check" },
];

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>("api-key");
  const [apiKey, setApiKey] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    actionId: "",
    status: "",
    notes: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");

  const validateApiKey = async () => {
    if (!apiKey.trim()) {
      setKeyError("Please enter your SafetyCulture API key");
      return;
    }

    setIsValidatingKey(true);
    setKeyError("");

    try {
      const response = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (data.valid) {
        setCurrentStep("upload");
      } else {
        setKeyError(data.message || "Invalid API key. Please check and try again.");
      }
    } catch {
      setKeyError("Failed to validate API key. Please try again.");
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        if (jsonData.length > 0) {
          const columns = Object.keys(jsonData[0]);
          setExcelColumns(columns);
          setExcelData(jsonData);
          setCurrentStep("mapping");
        }
      } catch {
        alert("Failed to parse Excel file. Please ensure it's a valid .xlsx or .xls file.");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleMappingChange = (field: keyof FieldMapping, value: string) => {
    setFieldMapping((prev) => ({ ...prev, [field]: value }));
  };

  const canProceedWithMapping = () => {
    return fieldMapping.actionId && fieldMapping.status;
  };

  const getStatusId = (statusValue: string): string | null => {
    const normalizedValue = statusValue.toString().toLowerCase().trim();

    const exactMatch = STATUS_OPTIONS.find(
      (opt) => opt.label.toLowerCase() === normalizedValue || opt.id === statusValue
    );
    if (exactMatch) return exactMatch.id;

    const partialMatch = STATUS_OPTIONS.find(
      (opt) => normalizedValue.includes(opt.label.toLowerCase().replace(" ", "")) ||
               opt.label.toLowerCase().includes(normalizedValue)
    );
    if (partialMatch) return partialMatch.id;

    if (normalizedValue.includes("todo") || normalizedValue === "to do") {
      return STATUS_OPTIONS[0].id;
    }
    if (normalizedValue.includes("progress") || normalizedValue === "in progress") {
      return STATUS_OPTIONS[1].id;
    }
    if (normalizedValue.includes("complete") || normalizedValue === "done" || normalizedValue === "completed") {
      return STATUS_OPTIONS[2].id;
    }
    if (normalizedValue.includes("can't") || normalizedValue.includes("cant") || normalizedValue === "cannot do") {
      return STATUS_OPTIONS[3].id;
    }

    return null;
  };

  const processActions = async () => {
    setIsProcessing(true);
    setCurrentStep("processing");
    setProcessingResults([]);
    setCurrentProcessingIndex(0);

    const results: ProcessingResult[] = [];

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      setCurrentProcessingIndex(i);

      const actionId = row[fieldMapping.actionId]?.toString() || "";
      const statusValue = row[fieldMapping.status]?.toString() || "";
      const notes = fieldMapping.notes ? row[fieldMapping.notes]?.toString() || "" : "";

      if (!actionId) {
        results.push({
          actionId: `Row ${i + 2}`,
          success: false,
          message: "Missing Action ID",
        });
        continue;
      }

      const statusId = getStatusId(statusValue);
      if (!statusId) {
        results.push({
          actionId,
          success: false,
          message: `Invalid status: "${statusValue}"`,
        });
        continue;
      }

      try {
        const response = await fetch("/api/update-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            actionId,
            statusId,
            notes,
          }),
        });

        const data = await response.json();

        if (data.success) {
          results.push({
            actionId,
            success: true,
            message: `Updated to "${STATUS_OPTIONS.find((s) => s.id === statusId)?.label}"${notes ? " with notes" : ""}`,
          });
        } else {
          results.push({
            actionId,
            success: false,
            message: data.message || "Failed to update",
          });
        }
      } catch {
        results.push({
          actionId,
          success: false,
          message: "Network error",
        });
      }

      setProcessingResults([...results]);
    }

    setIsProcessing(false);
    setCurrentStep("complete");
  };

  const resetTool = () => {
    setCurrentStep("api-key");
    setApiKey("");
    setExcelData([]);
    setExcelColumns([]);
    setFileName("");
    setFieldMapping({ actionId: "", status: "", notes: "" });
    setProcessingResults([]);
    setCurrentProcessingIndex(0);
  };

  const successCount = processingResults.filter((r) => r.success).length;
  const failCount = processingResults.filter((r) => !r.success).length;

  const steps: Step[] = ["api-key", "upload", "mapping", "processing", "complete"];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="min-h-screen">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-indigo-200/40 to-purple-300/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 -left-40 w-[400px] h-[400px] bg-gradient-to-br from-pink-200/30 to-rose-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-200/30 to-indigo-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s' }} />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Header */}
      <header className="relative bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  Safety<span className="text-indigo-600">Insights</span>
                </h1>
                <p className="text-xs text-gray-500">Bulk Action Updater Tool</p>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
              {currentStep !== "api-key" && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-medium text-emerald-700">Connected</span>
                </div>
              )}
              <button
                onClick={() => {
                  setTempApiKey(apiKey);
                  setShowApiKeyModal(true);
                }}
                className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center cursor-pointer"
                title="API Settings"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">API Settings</h3>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SafetyCulture API Key</label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="input-refined"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setApiKey(tempApiKey);
                    setShowApiKeyModal(false);
                    if (currentStep === "api-key" && tempApiKey) {
                      validateApiKey();
                    }
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold hover:from-indigo-600 hover:to-purple-600 transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative bg-gradient-to-b from-indigo-50/50 via-white to-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100/80 text-indigo-700 text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Bulk Action Updates Made Easy
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            Update Actions <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">at Scale</span>
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Upload your spreadsheet, map your columns, and update hundreds of SafetyCulture actions in seconds.
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="relative max-w-4xl mx-auto px-6 pt-8 pb-6">
        <div className="relative flex items-center justify-between">
          {STEPS.map((step, index) => {
            const stepIndex = steps.indexOf(step.key as Step);
            const isActive = stepIndex === currentIndex;
            const isComplete = stepIndex < currentIndex;

            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center relative z-10">
                  <div
                    className={`relative w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      isComplete
                        ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-md shadow-green-500/20"
                        : isActive
                        ? "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20 scale-105"
                        : "bg-white text-gray-400 border-2 border-gray-200"
                    }`}
                  >
                    {isComplete ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-base">{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`mt-3 text-xs font-semibold tracking-wide transition-colors ${
                      isActive
                        ? "text-indigo-600"
                        : isComplete
                        ? "text-emerald-600"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className="flex-1 mx-4 h-0.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        stepIndex < currentIndex
                          ? "bg-gradient-to-r from-emerald-400 to-green-500 w-full"
                          : "w-0"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-5xl mx-auto px-6 pb-16">
        <div className="relative bg-white/90 backdrop-blur-2xl rounded-[2rem] border border-white shadow-2xl shadow-indigo-200/30 p-8 md:p-12 overflow-hidden">
          {/* Card inner glow effects */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
          <div className="absolute top-0 left-1/4 w-1/2 h-40 bg-gradient-to-b from-indigo-100/50 to-transparent blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-purple-200/40 to-transparent" />
          {/* Corner accents */}
          <div className="absolute top-4 right-4 w-20 h-20 bg-gradient-to-br from-pink-100/30 to-transparent rounded-full blur-xl pointer-events-none" />
          <div className="absolute bottom-4 left-4 w-16 h-16 bg-gradient-to-tr from-indigo-100/30 to-transparent rounded-full blur-xl pointer-events-none" />
          {/* Step 1: API Key */}
          {currentStep === "api-key" && (
            <div className="relative animate-fade-in space-y-8">
              <div className="text-center max-w-lg mx-auto">
                <div className="relative inline-flex items-center justify-center w-20 h-20 mb-8">
                  {/* Animated rings */}
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-200 to-purple-200 animate-ping opacity-20" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-2 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100" />
                  <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100/50 flex items-center justify-center shadow-lg shadow-indigo-100/50">
                    <svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent mb-4">
                  Connect Your Account
                </h2>
                <p className="text-gray-500 leading-relaxed text-lg">
                  Enter your SafetyCulture API key to securely connect and start updating your actions in bulk.
                </p>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-semibold text-gray-700 mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your SafetyCulture API key"
                      className="input-refined pr-12"
                      onKeyDown={(e) => e.key === "Enter" && validateApiKey()}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  {keyError && (
                    <div className="mt-3 flex items-start gap-2 text-red-600 bg-red-50 rounded-xl p-3">
                      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm">{keyError}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={validateApiKey}
                  disabled={isValidatingKey}
                  className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5"
                >
                  {isValidatingKey ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect & Continue
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        How to get your API key
                      </h3>
                      <ol className="text-sm text-gray-600 space-y-1.5">
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium">1</span>
                          Log in to SafetyCulture
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium">2</span>
                          Go to Settings → API
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium">3</span>
                          Generate a new token
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Download Sample CSV Button */}
                <button
                  onClick={() => {
                    const sampleData = `Action_ID,Title,Status,Notes
ff9e1a9d-944b-41b2-af34-38eef77471b6,"Audit PPE inventory levels",In Progress,"Inventory count underway - awaiting final tally"
ff47a58e-1fc4-48e7-b7f3-d2267308f8c4,"Schedule safety training session",Complete,"Training scheduled for Jan 25th with 15 attendees"
6c0249cb-9da0-435b-a18b-dff133804f72,"Install eye wash station",In Progress,"Plumber scheduled for installation on Monday"`;
                    const blob = new Blob([sampleData], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'sample_actions.csv';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 text-emerald-700 text-sm font-semibold hover:from-emerald-100 hover:to-teal-100 hover:border-emerald-300 transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Sample CSV Template
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {currentStep === "upload" && (
            <div className="relative animate-fade-in space-y-8">
              <div className="text-center max-w-lg mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 mb-6">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Upload Your Data
                </h2>
                <p className="text-gray-500 leading-relaxed">
                  Upload an Excel file containing your action IDs, statuses, and optional notes.
                </p>
                {/* Download Sample CSV */}
                <button
                  onClick={() => {
                    const sampleData = `Action_ID,Title,Status,Notes
ff9e1a9d-944b-41b2-af34-38eef77471b6,"Audit PPE inventory levels",In Progress,"Inventory count underway - awaiting final tally"
ff47a58e-1fc4-48e7-b7f3-d2267308f8c4,"Schedule safety training session",Complete,"Training scheduled for Jan 25th with 15 attendees"
6c0249cb-9da0-435b-a18b-dff133804f72,"Install eye wash station",In Progress,"Plumber scheduled for installation on Monday"`;
                    const blob = new Blob([sampleData], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'sample_actions.csv';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-semibold hover:bg-indigo-200 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Sample CSV
                </button>
              </div>

              <div className="max-w-lg mx-auto">
                <label
                  htmlFor="file-upload"
                  className="group relative block border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300 cursor-pointer"
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-sm text-gray-500">
                    Supports Excel (.xlsx, .xls) and CSV files
                  </p>
                </label>
              </div>

              <div className="max-w-lg mx-auto">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        Required columns
                      </h3>
                      <ul className="text-sm text-gray-600 space-y-1.5">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <strong>Action ID</strong> — Unique identifier
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <strong>Status</strong> — To Do, In Progress, Complete, Can&apos;t Do
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          <strong>Notes</strong> — Optional comments
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Mapping */}
          {currentStep === "mapping" && (
            <div className="relative animate-fade-in space-y-8">
              <div className="text-center max-w-lg mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 mb-6">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Configure Column Mapping
                </h2>
                <p className="text-gray-500 leading-relaxed">
                  Found <span className="font-semibold text-indigo-600">{excelData.length} rows</span> in{" "}
                  <span className="font-semibold text-gray-700">{fileName}</span>
                </p>
              </div>

              {/* File Info Card */}
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{fileName}</p>
                    <p className="text-xs text-gray-500">{excelColumns.length} columns detected • {excelData.length} data rows</p>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-medium text-emerald-700">Ready</span>
                  </div>
                </div>
              </div>

              {/* Mapping Cards */}
              <div className="max-w-2xl mx-auto">
                <div className="grid gap-4">
                  {/* Action ID Mapping */}
                  <div className={`relative p-5 rounded-2xl border-2 transition-all duration-200 ${
                    fieldMapping.actionId
                      ? "border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-green-50/30"
                      : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        fieldMapping.actionId
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-semibold text-gray-900">Action ID</label>
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wide">Required</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">The unique identifier for each SafetyCulture action</p>
                        <div className="relative">
                          <select
                            value={fieldMapping.actionId}
                            onChange={(e) => handleMappingChange("actionId", e.target.value)}
                            className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                              fieldMapping.actionId
                                ? "border-emerald-300 text-gray-900 focus:ring-emerald-500/20 focus:border-emerald-400"
                                : "border-gray-200 text-gray-700 focus:ring-indigo-500/20 focus:border-indigo-400"
                            }`}
                          >
                            <option value="">Select a column...</option>
                            {excelColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            {fieldMapping.actionId ? (
                              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Mapping */}
                  <div className={`relative p-5 rounded-2xl border-2 transition-all duration-200 ${
                    fieldMapping.status
                      ? "border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-green-50/30"
                      : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        fieldMapping.status
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-semibold text-gray-900">Status</label>
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wide">Required</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">To Do, In Progress, Complete, or Can&apos;t Do</p>
                        <div className="relative">
                          <select
                            value={fieldMapping.status}
                            onChange={(e) => handleMappingChange("status", e.target.value)}
                            className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                              fieldMapping.status
                                ? "border-emerald-300 text-gray-900 focus:ring-emerald-500/20 focus:border-emerald-400"
                                : "border-gray-200 text-gray-700 focus:ring-indigo-500/20 focus:border-indigo-400"
                            }`}
                          >
                            <option value="">Select a column...</option>
                            {excelColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            {fieldMapping.status ? (
                              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Mapping (Optional) */}
                  <div className={`relative p-5 rounded-2xl border-2 transition-all duration-200 ${
                    fieldMapping.notes
                      ? "border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-green-50/30"
                      : "border-dashed border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-white"
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        fieldMapping.notes
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-gray-100 text-gray-400"
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-semibold text-gray-900">Notes / Comments</label>
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium uppercase tracking-wide">Optional</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Add comments to actions when updating their status</p>
                        <div className="relative">
                          <select
                            value={fieldMapping.notes}
                            onChange={(e) => handleMappingChange("notes", e.target.value)}
                            className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                              fieldMapping.notes
                                ? "border-emerald-300 text-gray-900 focus:ring-emerald-500/20 focus:border-emerald-400"
                                : "border-gray-200 text-gray-500 focus:ring-indigo-500/20 focus:border-indigo-400"
                            }`}
                          >
                            <option value="">Skip this field</option>
                            {excelColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            {fieldMapping.notes ? (
                              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mapping Progress */}
                <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Mapping Progress</span>
                    <span className="text-sm font-semibold text-indigo-600">
                      {[fieldMapping.actionId, fieldMapping.status, fieldMapping.notes].filter(Boolean).length} of 3 mapped
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className={`flex-1 h-2 rounded-full transition-colors ${fieldMapping.actionId ? "bg-emerald-400" : "bg-gray-200"}`} />
                    <div className={`flex-1 h-2 rounded-full transition-colors ${fieldMapping.status ? "bg-emerald-400" : "bg-gray-200"}`} />
                    <div className={`flex-1 h-2 rounded-full transition-colors ${fieldMapping.notes ? "bg-emerald-400" : "bg-gray-200"}`} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              {fieldMapping.actionId && fieldMapping.status && (
                <div className="max-w-3xl mx-auto">
                  <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">Data Preview</h3>
                      </div>
                      <span className="text-xs text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-gray-200">Showing first 5 rows</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50/80">
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action ID</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                            {fieldMapping.notes && <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {excelData.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                              <td className="px-5 py-3.5">
                                <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md font-mono">
                                  {row[fieldMapping.actionId]?.toString().slice(0, 20) || "-"}...
                                </code>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                                  row[fieldMapping.status]?.toString().toLowerCase().includes("complete")
                                    ? "bg-emerald-100 text-emerald-700"
                                    : row[fieldMapping.status]?.toString().toLowerCase().includes("progress")
                                    ? "bg-blue-100 text-blue-700"
                                    : row[fieldMapping.status]?.toString().toLowerCase().includes("can")
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
                                  {row[fieldMapping.status]?.toString() || "-"}
                                </span>
                              </td>
                              {fieldMapping.notes && (
                                <td className="px-5 py-3.5 text-gray-600 max-w-[200px]">
                                  <span className="truncate block text-xs">
                                    {row[fieldMapping.notes]?.toString() || <span className="text-gray-300 italic">No notes</span>}
                                  </span>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-2xl mx-auto flex gap-4">
                <button
                  onClick={() => setCurrentStep("upload")}
                  className="flex-1 py-4 px-6 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button
                  onClick={processActions}
                  disabled={!canProceedWithMapping()}
                  className="flex-[2] py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Update {excelData.length} Actions
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {currentStep === "processing" && (
            <div className="relative animate-fade-in space-y-8">
              <div className="text-center max-w-lg mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 mb-6">
                  <svg className="w-8 h-8 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Updating Actions
                </h2>
                <p className="text-gray-500 leading-relaxed">
                  Processing {currentProcessingIndex + 1} of {excelData.length} actions...
                </p>
              </div>

              <div className="max-w-lg mx-auto space-y-4">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-gray-600">Progress</span>
                  <span className="text-indigo-600">{Math.round(((currentProcessingIndex + 1) / excelData.length) * 100)}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((currentProcessingIndex + 1) / excelData.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="max-w-2xl mx-auto max-h-64 overflow-y-auto space-y-2 pr-2">
                {processingResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                      result.success
                        ? "bg-emerald-50 border border-emerald-100"
                        : "bg-red-50 border border-red-100"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      result.success ? "bg-emerald-100" : "bg-red-100"
                    }`}>
                      {result.success ? (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-xs ${result.success ? "text-emerald-700" : "text-red-700"}`}>
                        {result.actionId}
                      </p>
                      <p className={`text-sm ${result.success ? "text-emerald-600" : "text-red-600"}`}>
                        {result.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-3 text-gray-500">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm font-medium">Processing...</span>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Complete */}
          {currentStep === "complete" && (
            <div className="relative animate-fade-in space-y-8 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-100 to-green-100 mb-4">
                <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-3">
                  Update Complete!
                </h2>
                <p className="text-gray-500 text-lg">
                  Successfully processed {excelData.length} actions
                </p>
              </div>

              <div className="flex justify-center gap-12">
                <div className="text-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent">
                    {successCount}
                  </div>
                  <div className="text-sm font-medium text-gray-500 mt-1">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-red-500 to-rose-500 bg-clip-text text-transparent">
                    {failCount}
                  </div>
                  <div className="text-sm font-medium text-gray-500 mt-1">Failed</div>
                </div>
              </div>

              {failCount > 0 && (
                <div className="max-w-2xl mx-auto text-left">
                  <div className="bg-red-50 rounded-2xl border border-red-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-red-100 bg-red-100/50">
                      <h3 className="text-sm font-semibold text-red-700">Failed Updates</h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-red-100">
                      {processingResults
                        .filter((r) => !r.success)
                        .map((result, idx) => (
                          <div key={idx} className="px-5 py-3 flex items-center gap-3">
                            <span className="font-mono text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                              {result.actionId}
                            </span>
                            <span className="text-sm text-red-700">{result.message}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={resetTool}
                className="inline-flex items-center gap-3 py-4 px-8 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Start New Update
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col items-center text-center">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-lg font-bold text-gray-900">Safety<span className="text-indigo-600">Insights</span></span>
                <p className="text-xs text-gray-500">Bulk Action Updater Tool</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 max-w-md mb-6">
              Streamline your SafetyCulture workflow with powerful bulk action management tools.
            </p>
            <p className="text-xs text-gray-400">
              © 2026 SafetyInsights. Powered by SafetyCulture API.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
