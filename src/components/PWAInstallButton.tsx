import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = () => {
    if (isInstallable) {
      void install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      {variant === 'card' ? (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/apple-touch-icon.png"
              alt="한림 TAXI 앱 아이콘"
              className="w-12 h-12 rounded-2xl border border-[#DCE9F8] shrink-0 object-cover"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#0D1B3E]">홈 화면에 앱 추가</h3>
              <p className="text-xs text-[#435E8D] mt-0.5 leading-relaxed">
                한림 TAXI 아이콘을 홈 화면에 추가해 바로 실행할 수 있어요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="min-h-[44px] px-4 rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-4 h-4" />
            홈 화면 추가
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="min-h-[40px] px-3.5 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#EBF4FF] text-[#0D1B3E] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-[#1D5CE5]" />
          홈 화면에 추가
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-[#0D1B3E]/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/apple-touch-icon.png"
                  alt="한림 TAXI 아이콘"
                  className="w-12 h-12 rounded-2xl border border-[#DCE9F8] object-cover"
                />
                <div>
                  <h3 className="text-base font-bold text-[#0D1B3E]">홈 화면에 추가하기</h3>
                  <p className="text-xs text-[#435E8D]">한림 TAXI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#435E8D] hover:bg-[#EBF4FF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-xs text-[#0D1B3E] space-y-2.5 bg-[#F4F9FF] rounded-2xl p-4 leading-relaxed">
                <li className="flex items-center gap-2">
                  <span className="font-bold text-[#1D5CE5]">1.</span>
                  <span>
                    Safari 하단/상단의{' '}
                    <strong className="inline-flex items-center gap-1">
                      공유 <Share className="w-3.5 h-3.5 text-[#1D5CE5]" />
                    </strong>{' '}
                    버튼을 눌러 주세요.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-[#1D5CE5]">2.</span>
                  <span>
                    아래로 내려 <strong>홈 화면에 추가</strong>를 눌러 주세요.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-[#1D5CE5]">3.</span>
                  <span>
                    오른쪽 위 <strong>추가</strong>를 누르면 홈 화면에 아이콘이 생성돼요.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="text-xs text-[#0D1B3E] space-y-2 bg-[#F4F9FF] rounded-2xl p-4 leading-relaxed">
                <p>
                  브라우저 주소창 오른쪽의 <strong>앱 설치</strong> 아이콘이나 브라우저 메뉴(⋮)에서{' '}
                  <strong>홈 화면에 추가 / 앱 설치</strong>를 선택하면 한림 TAXI 아이콘이 홈 화면에 추가돼요.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
};
