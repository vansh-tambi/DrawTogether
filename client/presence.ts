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
      el.classList.add('user-leaving');
      setTimeout(() => {
        this.users.delete(userId);
        this.render();
      }, 160);
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

  private formatShortId(userId: string): string {
    if (userId.length <= 10) return userId;
    return `${userId.substring(0, 8)}…`;
  }

  public render(): void {
    const count = this.users.size;
    if (this.onCountChange) {
      this.onCountChange(count);
    }

    let html = '';

    for (const user of this.users.values()) {
      const isLocal = user.userId === this.localUserId;
      const label = isLocal ? `${this.formatShortId(user.userId)} (You)` : this.formatShortId(user.userId);

      html += `
        <div class="presence-pill ${isLocal ? 'is-local' : ''}" data-user-id="${user.userId}" title="${user.userId}">
          <span class="avatar-dot" style="background-color: ${user.color};"></span>
          <span class="avatar-name">${label}</span>
        </div>
      `;
    }

    this.container.innerHTML = html;
  }
}
