import type { UserPresence } from '../shared/protocol';

export interface PresenceUser {
  userId: string;
  color: string;
}

export class PresenceUI {
  private container: HTMLElement;
  private users: Map<string, PresenceUser> = new Map();
  private localUserId: string;

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
    this.users.delete(userId);
    this.render();
  }

  public getUserColor(userId: string): string | undefined {
    return this.users.get(userId)?.color;
  }

  private formatShortId(userId: string): string {
    if (userId.length <= 10) return userId;
    return `${userId.substring(0, 8)}…`;
  }

  public render(): void {
    const count = this.users.size;

    let html = `
      <div class="presence-header">
        <span class="presence-pulse-dot"></span>
        <span class="presence-title">${count} Online</span>
      </div>
      <div class="presence-list">
    `;

    for (const user of this.users.values()) {
      const isLocal = user.userId === this.localUserId;
      const label = isLocal ? `${this.formatShortId(user.userId)} (You)` : this.formatShortId(user.userId);

      html += `
        <div class="presence-user-chip ${isLocal ? 'is-local' : ''}" title="${user.userId}">
          <span class="user-color-dot" style="background-color: ${user.color};"></span>
          <span class="user-name">${label}</span>
        </div>
      `;
    }

    html += `</div>`;
    this.container.innerHTML = html;
  }
}
