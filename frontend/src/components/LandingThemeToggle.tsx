import { Moon, Sun } from "lucide-react";
import type { LandingTheme } from "@/hooks/useLandingTheme";

type LandingThemeToggleProps = {
  theme: LandingTheme;
  onToggle: () => void;
};

const LandingThemeToggle = ({ theme, onToggle }: LandingThemeToggleProps) => {
  const isLightTheme = theme === "light";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isLightTheme ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      title={isLightTheme ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        isLightTheme
          ? "border-black/10 bg-black/[0.04] text-black/70 hover:bg-black/[0.08] hover:text-black"
          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {isLightTheme ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
};

export default LandingThemeToggle;