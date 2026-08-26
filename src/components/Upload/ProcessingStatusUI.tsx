import React from 'react';
import { ProcessingStep } from '../../types/audiobook';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';

interface ProcessingStatusUIProps {
  steps: ProcessingStep[];
  currentStepIndex: number;
  bookTitle: string;
}

export const ProcessingStatusUI: React.FC<ProcessingStatusUIProps> = ({
  steps,
  currentStepIndex,
  bookTitle,
}) => {
  return (
    <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 md:p-8 max-w-lg mx-auto space-y-6 shadow-2xl text-center">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30 flex items-center justify-center mx-auto mb-4 animate-pulse-subtle">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <h3 className="text-xl font-bold text-white">Processing Audiobook...</h3>
        <p className="text-sm text-gray-400 mt-1">
          Building <span className="text-[#FFD600] font-semibold">{bookTitle || 'Audiobook'}</span>
        </p>
      </div>

      <div className="space-y-3 text-left bg-[#121212] border border-[#222222] rounded-xl p-4">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed' || idx < currentStepIndex;
          const isActive = step.status === 'active' || idx === currentStepIndex;
          const isFailed = step.status === 'failed';

          return (
            <div key={step.id} className="flex items-center gap-3 py-1.5">
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : isFailed ? (
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              ) : isActive ? (
                <Loader2 className="w-5 h-5 text-[#FFD600] animate-spin flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-600 flex-shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    isCompleted
                      ? 'text-gray-300'
                      : isActive
                      ? 'text-[#FFD600] font-bold'
                      : isFailed
                      ? 'text-red-400'
                      : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </p>
                {step.detail && (
                  <p className="text-xs text-gray-500 truncate">{step.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        AI chapter detection and audio slicing running. This may take a few moments.
      </p>
    </div>
  );
};
