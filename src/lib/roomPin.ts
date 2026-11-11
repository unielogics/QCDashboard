/** New credentials follow the server's canonical client-room PIN rules. */
export function chosenRoomPinProblem(pin: string, confirmation: string, locale: "en" | "es" = "en", currentPin?: string): string | null {
  const es = locale === "es";
  if (!/^[0-9]{6}$/.test(pin)) return es ? "Elija un PIN de 6 dígitos." : "Choose a 6-digit room PIN.";
  if (/^([0-9])\1{5}$/.test(pin) || ["123456", "654321", "012345", "543210", "123123", "112233", "121212", "111222"].includes(pin)) {
    return es ? "Elija un PIN que no sea fácil de adivinar; evite números repetidos o consecutivos." : "Choose a PIN that is not easy to guess; avoid repeated or consecutive numbers.";
  }
  if (currentPin && pin === currentPin) return es ? "Elija un PIN diferente al que le enviamos." : "Choose a PIN different from the one we sent you.";
  if (pin !== confirmation) return es ? "Los dos PIN no coinciden." : "The two room PIN entries do not match.";
  return null;
}
