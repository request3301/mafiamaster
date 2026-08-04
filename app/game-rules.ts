export type Winner = "red" | "black";

type RulePlayer = {
  alive: boolean;
  role: "Мирный" | "Мафия" | "Дон" | "Шериф" | null;
};

export function getWinner(players: RulePlayer[]): Winner | null {
  const alivePlayers = players.filter((player) => player.alive);
  const blackCount = alivePlayers.filter((player) => player.role === "Мафия" || player.role === "Дон").length;
  const redCount = alivePlayers.length - blackCount;

  if (blackCount === 0) return "red";
  if (blackCount >= redCount) return "black";
  return null;
}
