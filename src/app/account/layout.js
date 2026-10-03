import ThemePicker from "@/components/ThemePicker";

export default function AccountLayout({ children }) {
  return (
    <>
      {children}
      <ThemePicker />
    </>
  );
}
