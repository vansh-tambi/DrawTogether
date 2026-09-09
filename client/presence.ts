import type { UserPresence } from '../shared/protocol';

export interface PresenceUser {
  userId: string;
  color: string;
}

export class PresenceUI {
  private container: HTMLElement;
  private users: Map<string, PresenceUser> = new Map();
  private localUserId: string;
  public onCountChange?: (count: number) => void;

  constructor(container: HTMLElement, localUserId: string) {
    this.container = container;
    this.localUserId = localUserId;
    this.render();
  }

  public setLocalUserId(userId: string): void {
    this.localUserId = userId;
    this.render();
  }

  public setUsers(presenceList: UserPresence[]): void {
    this.users.clear();
    for (const p of presenceList) {
      this.users.set(p.userId, {
        userId: p.userId,
        color: p.color,
      });
    }
    this.render();
  }

  public addUser(userId: string, color: string): void {
    this.users.set(userId, { userId, color });
    this.render();
  }

  public removeUser(userId: string): void {
    const el = this.container.querySelector(`[data-user-id="${userId}"]`) as HTMLElement;
    if (el) {
      el.classList.add('scale-75', 'opacity-0', 'transition-all', 'duration-200');
      setTimeout(() => {
        this.users.delete(userId);
        this.render();
      }, 180);
    } else {
      this.users.delete(userId);
      this.render();
    }
  }

  public getUserColor(userId: string): string | undefined {
    return this.users.get(userId)?.color;
  }

  public getUserCount(): number {
    return this.users.size;
  }

  private getInitials(userId: string): string {
    const clean = userId.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 2) {
      return clean.substring(clean.length - 2).toUpperCase();
    }
    return (clean[0] || 'U').toUpperCase();
  }

  private formatShortId(userId: string): string {
    if (userId.length <= 10) return userId;
    return `${userId.substring(0, 8)}…`;
  }

  public render(): void {
    const count = this.users.size;
    if (this.onCountChange) {
      this.onCountChange(count);
    }

    const allUsers = Array.from(this.users.values());
    // Put local user first
    allUsers.sort((a, b) => {
      if (a.userId === this.localUserId) return -1;
      if (b.userId === this.localUserId) return 1;
      return 0;
    });

    const maxVisible = 4;
    const visibleUsers = allUsers.slice(0, maxVisible);
    const overflowCount = allUsers.length - maxVisible;

    let html = `<div class="flex items-center -space-x-1.5 hover:space-x-1 transition-all duration-200 py-0.5">`;

    for (const user of visibleUsers) {
      const isLocal = user.userId === this.localUserId;
      const initials = this.getInitials(user.userId);
      const title = isLocal ? `${user.userId} (You)` : user.userId;

      html += `
        <div
          class="relative group cursor-pointer transition-transform duration-150 hover:scale-115 hover:z-20"
          data-user-id="${user.userId}"
          title="${title}"
        >
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-2 ring-white/90 dark:ring-zinc-900/90 select-none transition-shadow"
            style="background-color: ${user.color};"
          >
            ${initials}
          </div>
          ${
            isLocal
              ? `<span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-1.5 ring-white" title="You"></span>`
              : ''
          }
        </div>
      `;
    }

    if (overflowCount > 0) {
      const remainingUsers = allUsers.slice(maxVisible).map((u) => u.userId).join(', ');
      html += `
        <div
          class="relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 ring-2 ring-white/90 dark:ring-zinc-900/90 shadow-sm cursor-pointer hover:scale-110 hover:z-20 transition-transform select-none"
          title="Collaborators: ${remainingUsers}"
        >
          +${overflowCount}
        </div>
      `;
    }

    html += `</div>`;

    this.container.innerHTML = html;
  }
}
