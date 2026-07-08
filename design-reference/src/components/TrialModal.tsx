import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, ArrowRight, Sparkles, Building2, User, Mail, ShieldAlert } from "lucide-react";

interface TrialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TrialModal({ isOpen, onClose }: TrialModalProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    companyName: "",
    companySize: "1-10",
    useCase: "support",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Invalid email address";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.companyName.trim()) newErrors.companyName = "Company name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 2 && validateStep2()) {
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        setStep(3);
      }, 1500);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFormData({
      name: "",
      email: "",
      password: "",
      companyName: "",
      companySize: "1-10",
      useCase: "support",
    });
    setErrors({});
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-on-background/40 backdrop-blur-md"
            id="modal-backdrop"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant/30 z-10"
            id="trial-modal-content"
          >
            {/* Top Indicator / Accent Line */}
            <div className="h-1.5 cta-accent w-full" />

            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-colors"
              aria-label="Close modal"
              id="close-modal-btn"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8">
              {/* Steps Progress */}
              {step < 3 && (
                <div className="flex items-center gap-2 mb-8">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${step >= 1 ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                    {step > 1 ? <Check className="w-4 h-4" /> : "1"}
                  </div>
                  <div className={`h-1 flex-1 rounded-full ${step > 1 ? 'bg-primary' : 'bg-surface-container'}`} />
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${step >= 2 ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                    2
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-6">
                      <h3 className="text-2xl font-extrabold tracking-tight text-on-background">Create your RigaChat account</h3>
                      <p className="text-on-surface-variant text-sm mt-1">Get started in under 2 minutes. No credit card required.</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-on-surface mb-1.5">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-3.5 w-5 h-5 text-outline" />
                          <input
                            type="text"
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={(e) => {
                              setFormData({ ...formData, name: e.target.value });
                              if (errors.name) setErrors({ ...errors, name: "" });
                            }}
                            className={`w-full pl-10 pr-4 py-3 bg-surface-container-low rounded-xl border ${errors.name ? 'border-error ring-1 ring-error' : 'border-outline-variant/50 focus:border-primary'} focus:outline-none transition-colors text-on-surface`}
                            id="signup-name-input"
                          />
                        </div>
                        {errors.name && <p className="text-error text-xs mt-1.5 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {errors.name}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-on-surface mb-1.5">Business Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3.5 w-5 h-5 text-outline" />
                          <input
                            type="email"
                            placeholder="you@company.com"
                            value={formData.email}
                            onChange={(e) => {
                              setFormData({ ...formData, email: e.target.value });
                              if (errors.email) setErrors({ ...errors, email: "" });
                            }}
                            className={`w-full pl-10 pr-4 py-3 bg-surface-container-low rounded-xl border ${errors.email ? 'border-error ring-1 ring-error' : 'border-outline-variant/50 focus:border-primary'} focus:outline-none transition-colors text-on-surface`}
                            id="signup-email-input"
                          />
                        </div>
                        {errors.email && <p className="text-error text-xs mt-1.5 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {errors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-on-surface mb-1.5">Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={(e) => {
                            setFormData({ ...formData, password: e.target.value });
                            if (errors.password) setErrors({ ...errors, password: "" });
                          }}
                          className={`w-full px-4 py-3 bg-surface-container-low rounded-xl border ${errors.password ? 'border-error ring-1 ring-error' : 'border-outline-variant/50 focus:border-primary'} focus:outline-none transition-colors text-on-surface`}
                          id="signup-password-input"
                        />
                        {errors.password && <p className="text-error text-xs mt-1.5 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {errors.password}</p>}
                      </div>

                      <button
                        type="button"
                        onClick={handleNext}
                        className="w-full mt-6 py-4 rounded-xl cta-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md hover:shadow-lg"
                        id="signup-next-btn"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-6">
                      <h3 className="text-2xl font-extrabold tracking-tight text-on-background">Tell us about your company</h3>
                      <p className="text-on-surface-variant text-sm mt-1">We will configure RigaChat to best fit your workload.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-on-surface mb-1.5">Company Name</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-3.5 w-5 h-5 text-outline" />
                          <input
                            type="text"
                            placeholder="Acme Corp"
                            value={formData.companyName}
                            onChange={(e) => {
                              setFormData({ ...formData, companyName: e.target.value });
                              if (errors.companyName) setErrors({ ...errors, companyName: "" });
                            }}
                            className={`w-full pl-10 pr-4 py-3 bg-surface-container-low rounded-xl border ${errors.companyName ? 'border-error ring-1 ring-error' : 'border-outline-variant/50 focus:border-primary'} focus:outline-none transition-colors text-on-surface`}
                            id="signup-company-input"
                          />
                        </div>
                        {errors.companyName && <p className="text-error text-xs mt-1.5 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {errors.companyName}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-on-surface mb-1.5">Company Size</label>
                          <select
                            value={formData.companySize}
                            onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
                            className="w-full px-4 py-3 bg-surface-container-low rounded-xl border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface"
                            id="signup-size-select"
                          >
                            <option value="1-10">1-10 employees</option>
                            <option value="11-50">11-50 employees</option>
                            <option value="51-200">51-200 employees</option>
                            <option value="201+">201+ employees</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-on-surface mb-1.5">Primary Use Case</label>
                          <select
                            value={formData.useCase}
                            onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                            className="w-full px-4 py-3 bg-surface-container-low rounded-xl border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface"
                            id="signup-usecase-select"
                          >
                            <option value="support">Customer Support</option>
                            <option value="sales">Sales &amp; Growth</option>
                            <option value="both">Both Support &amp; Sales</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="flex-1 py-4 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container transition-colors font-semibold"
                          id="signup-back-btn"
                        >
                          Back
                        </button>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-1 py-4 rounded-xl cta-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md disabled:opacity-50"
                          id="signup-submit-btn"
                        >
                          {isSubmitting ? (
                            <span className="flex items-center gap-2">
                              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Setting up...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              Create Space <Sparkles className="w-4 h-4" />
                            </span>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="text-center py-6"
                  >
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Check className="w-10 h-10 stroke-[3]" />
                    </div>

                    <h3 className="text-3xl font-extrabold text-on-background tracking-tight">Welcome to RigaChat, {formData.name.split(" ")[0]}!</h3>
                    <p className="text-on-surface-variant max-w-sm mx-auto mt-3">
                      Your high-converting workspace **{formData.companyName}** has been successfully provisioned. We've set up your AI RigaBot in minutes.
                    </p>

                    <div className="mt-8 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 text-left max-w-sm mx-auto">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        <Sparkles className="w-3.5 h-3.5" /> Workspace ready
                      </div>
                      <p className="text-xs text-on-surface-variant font-mono">URL: https://{formData.companyName.toLowerCase().replace(/[^a-z0-9]/g, "") || "workspace"}.rigachat.com</p>
                      <p className="text-xs text-on-surface-variant font-mono mt-1">Default Bot: RigaBot v1.0.0 (Active)</p>
                    </div>

                    <button
                      onClick={handleClose}
                      className="mt-8 px-10 py-4 rounded-xl cta-accent text-white font-semibold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0"
                      id="launch-workspace-btn"
                    >
                      Go to Dashboard
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
