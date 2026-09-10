import type { UserPresence } from '../shared/protocol';

export interface PresenceUser {
  userId: string;
  color: string;
  displayName?: string;
}

export class PresenceUI {
  private container: HTMLElement;
  private users: Map<string, PresenceUser> = new Map();
  private localUserId: string;
  private roomId: string = 'general';
  private connectionState: 'connected' | 'reconnecting' | 'connecting' | 'disconnected' | 'offline' = 'connected';
  private isPopoverOpen: boolean = false;
  public onCountChange?: (count: number) => void;

  constructor(container: HTMLElement, localUserId: string, roomId?: string) {
    this.container = container;
    this.localUserId = localUserId;
    if (roomId) this.roomId = roomId;

    this.setupGlobalListeners();
    this.render();
  }

  public setRoomId(roomId: string): void {
    this.roomId = roomId;
    if (this.isPopoverOpen) {
      this.render();
    }
  }

  public setConnectionState(state: 'connected' | 'reconnecting' | 'connecting' | 'disconnected' | 'offline'): void {
    this.connectionState = state;
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

  public getUserCount(): number {
    return this.users.size;
  }

  public togglePopover(force?: boolean): void {
    this.isPopoverOpen = typeof force === 'boolean' ? force : !this.isPopoverOpen;
    this.render();
  }

  public closePopover(): void {
    if (this.isPopoverOpen) {
      this.isPopoverOpen = false;
      this.render();
    }
  }

  private setupGlobalListeners(): void {
    document.addEventListener('click', (e: MouseEvent) => {
      if (!this.isPopoverOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && !this.container.contains(target)) {
        this.closePopover();
      }
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isPopoverOpen) {
        this.closePopover();
      }
    });
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

  /**
   * Renders avatar/dp stack:
   * - Shows 3 to 4 circular user avatars/dp
   * - Shows '...' pill if more than 4 users
   * - Zero text in the header, zero green blinking circle
   * - Clicking any avatar or '...' opens the full participants list
   */
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
    const overflowCount = Math.max(0, allUsers.length - maxVisible);

    const rootWrapper = document.createElement('div');
    rootWrapper.className = 'relative flex items-center';

    // Main Cluster Container (Avatar Stack - completely transparent and seamless)
    const cluster = document.createElement('div');
    cluster.className = 'presence-cluster flex items-center -space-x-2 cursor-pointer select-none bg-transparent border-0 shadow-none';
    cluster.setAttribute('role', 'region');
    cluster.setAttribute('aria-label', 'Active collaborators');
    cluster.title = 'Click to view participants';
    cluster.addEventListener('click', () => {
      this.togglePopover();
    });

    // Visible User Avatars / DP (up to 4)
    for (const user of visibleUsers) {
      const isLocal = user.userId === this.localUserId;
      const initials = this.getInitials(user.userId);

      const avatarBtn = document.createElement('button');
      avatarBtn.type = 'button';
      avatarBtn.className = 'presence-avatar-btn relative flex items-center justify-center rounded-full text-white font-bold text-xs shadow-md hover:scale-110 hover:z-20 active:scale-95 transition-all cursor-pointer border-2 border-white dark:border-zinc-900 select-none flex-shrink-0';
      avatarBtn.style.backgroundColor = user.color;
      avatarBtn.style.width = '30px';
      avatarBtn.style.height = '30px';
      avatarBtn.textContent = initials;
      avatarBtn.title = `${user.userId}${isLocal ? ' (You)' : ''} - Click to view participants`;
      avatarBtn.setAttribute('aria-expanded', this.isPopoverOpen ? 'true' : 'false');
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover();
      });

      

      cluster.appendChild(avatarBtn);
    }

    // Overflow "..." Badge when more than 4 users
    if (overflowCount > 0) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'presence-avatar-btn flex items-center justify-center rounded-full bg-zinc-200/90 dark:bg-zinc-800/90 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs tracking-wider shadow-md hover:scale-110 hover:z-20 active:scale-95 transition-all cursor-pointer border-2 border-white dark:border-zinc-900 select-none flex-shrink-0';
      moreBtn.style.width = '30px';
      moreBtn.style.height = '30px';
      moreBtn.textContent = '...';
      moreBtn.title = `+${overflowCount} more - Click to view all`;
      moreBtn.setAttribute('aria-expanded', this.isPopoverOpen ? 'true' : 'false');
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover();
      });
      cluster.appendChild(moreBtn);
    }

    rootWrapper.appendChild(cluster);

    // Connected Users Popover List (when clicked)
    if (this.isPopoverOpen) {
      const popover = this.buildPopover(allUsers);
      rootWrapper.appendChild(popover);
    }

    this.container.replaceChildren(rootWrapper);
  }

  /**
   * Constructs the Participants popover dropdown
   */
  private buildPopover(allUsers: PresenceUser[]): HTMLElement {
    const popover = document.createElement('div');
    popover.className = 'presence-popover absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-72 sm:w-80 rounded-2xl p-3.5 backdrop-blur-2xl bg-white/95 dark:bg-zinc-900/95 border border-white/60 dark:border-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.18),0_1px_3px_rgba(0,0,0,0.06)] animate-in fade-in zoom-in-95 duration-150';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', 'Participants List');

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between pb-2.5 mb-2 border-b border-zinc-200/60 dark:border-zinc-800';

    const titleArea = document.createElement('div');
    titleArea.className = 'flex items-center space-x-2';

    const title = document.createElement('span');
    title.className = 'text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400';
    title.textContent = 'Participants';

    const countBadge = document.createElement('span');
    countBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/50';
    countBadge.textContent = `${allUsers.length}`;

    titleArea.append(title, countBadge);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer';
    closeBtn.setAttribute('aria-label', 'Close list');
    closeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePopover();
    });

    header.append(titleArea, closeBtn);
    popover.appendChild(header);

    // Scrollable Users List
    const list = document.createElement('div');
    list.className = 'flex flex-col space-y-1.5 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar';

    for (const user of allUsers) {
      const isLocal = user.userId === this.localUserId;
      const initials = this.getInitials(user.userId);

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2 rounded-xl hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-colors group';

      // Left: Avatar + Names
      const userLeft = document.createElement('div');
      userLeft.className = 'flex items-center space-x-2.5 min-w-0';

      const avatar = document.createElement('div');
      avatar.className = 'w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0';
      avatar.style.backgroundColor = user.color;
      avatar.textContent = initials;

      const infoCol = document.createElement('div');
      infoCol.className = 'flex flex-col min-w-0';

      const nameRow = document.createElement('div');
      nameRow.className = 'flex items-center space-x-1.5';

      const nameText = document.createElement('span');
      nameText.className = 'text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[120px] sm:max-w-[140px]';
      nameText.textContent = user.userId;
      nameText.title = user.userId;
      nameRow.appendChild(nameText);

      if (isLocal) {
        const youBadge = document.createElement('span');
        youBadge.className = 'text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300';
        youBadge.textContent = 'You';
        nameRow.appendChild(youBadge);
      }

      const statusSubtitle = document.createElement('span');
      statusSubtitle.className = 'text-[10px] text-zinc-400 dark:text-zinc-500';
      statusSubtitle.textContent = isLocal ? 'Host (Drawing)' : 'Collaborator';

      infoCol.append(nameRow, statusSubtitle);
      userLeft.append(avatar, infoCol);

      // Right: Assigned Color dot & active pulse
      const userRight = document.createElement('div');
      userRight.className = 'flex items-center space-x-2 flex-shrink-0';

      const colorDot = document.createElement('div');
      colorDot.className = 'w-3.5 h-3.5 rounded-full border border-white dark:border-zinc-800 shadow-sm';
      colorDot.style.backgroundColor = user.color;
      colorDot.title = `Drawing Color: ${user.color}`;

      const activeBadge = document.createElement('span');
      activeBadge.className = 'w-2 h-2 rounded-full bg-emerald-500';
      activeBadge.title = 'Active';

      userRight.append(colorDot, activeBadge);
      item.append(userLeft, userRight);
      list.appendChild(item);
    }

    popover.appendChild(list);

    // Popover Footer: Room Identity & Quick Share
    const footer = document.createElement('div');
    footer.className = 'mt-3 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between';

    const roomInfo = document.createElement('div');
    roomInfo.className = 'flex items-center space-x-1.5 text-[11px] text-zinc-500 dark:text-zinc-400';
    roomInfo.innerHTML = `<span>Room:</span><span class="font-mono font-bold text-zinc-700 dark:text-zinc-200 truncate max-w-[90px]">${this.roomId}</span>`;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer';
    copyBtn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy Link</span>
    `;
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(window.location.href);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>Copied!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 1500);
      } catch {
        // clipboard fallback
      }
    });

    footer.append(roomInfo, copyBtn);
    popover.appendChild(footer);

    return popover;
  }
}
