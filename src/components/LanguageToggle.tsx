import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/use-language';
interface LanguageToggleProps {
  className?: string;
}
export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { language, toggleLanguage, t } = useLanguage();
  return (
    <Button
      onClick={toggleLanguage}
      variant="ghost"
      size="sm"
      className={`gap-1.5 hover:scale-105 transition-all duration-200 active:scale-95 ${className}`}
      aria-label={language === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
    >
      <Languages className="h-4 w-4" />
      <span className="text-sm font-medium">{language === 'en' ? t('switchToArabic') : t('switchToEnglish')}</span>
    </Button>
  );
}
