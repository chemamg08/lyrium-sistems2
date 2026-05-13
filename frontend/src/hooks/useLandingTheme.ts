import { useEffect, useState } from "react";

export type LandingTheme = "dark" | "light";

const STORAGE_KEY = "landingTheme";

const readStoredLandingTheme = (): LandingTheme => {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
};

export const useLandingTheme = () => {
  const [landingTheme, setLandingTheme] = useState<LandingTheme>(readStoredLandingTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, landingTheme);
  }, [landingTheme]);

  const toggleLandingTheme = () => {
    setLandingTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  return {
    landingTheme,
    isLightTheme: landingTheme === "light",
    toggleLandingTheme,
  };
};