
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Page {
    id: number;
    title: string;
    summary: string;
    image?: string;
    categories: string[];
    links: number[];
    seen?: number;
    score?: number;
}

export interface Profile {
    profileName: string;
    categoryScores: Record<string, number>;
    seenPosts: number[];
    likedPosts: number[];
    timeSpentTotal: number;
}

const DEFAULT_PROFILE: Profile = {
    profileName: "Default",
    categoryScores: {
        "given names": -1000,
        "surnames": -1000,
    },
    seenPosts: [],
    likedPosts: [],
    timeSpentTotal: 0,
};

export class XikipediaAlgorithm {
    db: SQLite.SQLiteDatabase;
    profile: Profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    postsWithoutLike = 0;
    timeSpentSession = 0;
    lastSpentTime = Date.now();
    profileId = 'default';

    constructor(db: SQLite.SQLiteDatabase) {
        this.db = db;
    }

    async loadProfile(profileId: string = 'default') {
        this.profileId = profileId;
        const stored = await AsyncStorage.getItem(`xikipedia-profile-${profileId}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            this.profile = { ...DEFAULT_PROFILE, ...parsed };
        } else {
            this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
        }
        this.timeSpentSession = 0;
        this.lastSpentTime = Date.now();
    }

    async saveProfile() {
        await AsyncStorage.setItem(`xikipedia-profile-${this.profileId}`, JSON.stringify(this.profile));
        
        // Update global settings
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
        const settings = JSON.parse(settingsStr);
        settings.profile = this.profileId;
        if (!settings.profiles) settings.profiles = ['default'];
        if (!settings.profiles.includes(this.profileId)) settings.profiles.push(this.profileId);
        await AsyncStorage.setItem('xikipedia-settings', JSON.stringify(settings));
    }

    async getNextPost(): Promise<Page> {
        // Optimization: pick 1000 random IDs instead of ORDER BY RANDOM()
        const maxIdRes: any = await this.db.getFirstAsync('SELECT MAX(id) as maxId FROM pages');
        const maxId = maxIdRes?.maxId || 300000;
        
        const randomIds = [];
        for (let i = 0; i < 1000; i++) {
            randomIds.push(Math.floor(Math.random() * maxId));
        }

        const candidates: any[] = await this.db.getAllAsync(
            `SELECT p.*, GROUP_CONCAT(c.category) as categories_list 
             FROM pages p 
             LEFT JOIN categories c ON p.id = c.page_id 
             WHERE p.id IN (${randomIds.join(',')}) 
             GROUP BY p.id`
        );

        const mappedCandidates = candidates.map(c => ({
            ...c,
            categories: c.categories_list ? c.categories_list.split(',') : [],
            links: JSON.parse(c.links),
            seen: this.profile.seenPosts.filter(id => id === c.id).length,
            image: c.image ? `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(c.image.replace(/ /g, '_'))}&width=512` : undefined
        }));

        const calculateScore = (p: Page) => {
            // Match index.html: (post.thumb ? 5 : 0) + (3**(post.seen??0)-1)*-50000;
            let score = (p.image ? 5 : 0) + (Math.pow(3, p.seen || 0) - 1) * -50000;
            p.categories.forEach(cat => {
                score += (this.profile.categoryScores[cat.toLowerCase()] || 0);
            });
            return score;
        };

        mappedCandidates.forEach(p => p.score = calculateScore(p));

        const rand = Math.random();
        let bestPost: Page;

        if (rand < 0.40) {
            // Weighted random (like index.html)
            const minScore = Math.min(...mappedCandidates.map(p => p.score!));
            const scores = mappedCandidates.map(p => p.score! - minScore);
            const totalScore = scores.reduce((a, b) => a + b, 0);
            let r = Math.random() * (totalScore || 1);
            bestPost = mappedCandidates[0];
            for (let i = 0; i < mappedCandidates.length; i++) {
                r -= scores[i];
                if (r <= 0) {
                    bestPost = mappedCandidates[i];
                    break;
                }
            }
        } else if (rand > 0.3) {
            // Highest score (matches original logic)
            bestPost = mappedCandidates.reduce((prev, current) => 
                (prev.score! > current.score!) ? prev : current
            );
        } else {
            // Pure random
            bestPost = mappedCandidates[Math.floor(Math.random() * mappedCandidates.length)];
        }

        // Track time and seen
        this.profile.seenPosts.push(bestPost.id);
        const now = Date.now();
        const timeSpent = Math.min(10000, now - this.lastSpentTime);
        this.lastSpentTime = now;
        this.profile.timeSpentTotal += timeSpent;
        this.timeSpentSession += timeSpent;

        return bestPost;
    }

    async engagePost(page: Page, amount: number, isLike: boolean = false) {
        console.log(`Engaging ${page.categories.length} categories with ${amount} pts`);
        page.categories.forEach(cat => {
            const lowCat = cat.toLowerCase();
            this.profile.categoryScores[lowCat] = (this.profile.categoryScores[lowCat] || 0) + amount;
        });

        if (isLike) {
            if (!this.profile.likedPosts.includes(page.id)) {
                this.profile.likedPosts.push(page.id);
            }
            this.postsWithoutLike = 0;
        }

        await this.saveProfile();
    }

    async toggleLike(page: Page) {
        const isLiked = this.profile.likedPosts.includes(page.id);
        const amount = this.getLikeScore();

        if (isLiked) {
            // Unlike: Remove from list and subtract points
            this.profile.likedPosts = this.profile.likedPosts.filter(id => id !== page.id);
            page.categories.forEach(cat => {
                const lowCat = cat.toLowerCase();
                this.profile.categoryScores[lowCat] = (this.profile.categoryScores[lowCat] || 0) - amount;
            });
        } else {
            // Like: Add to list and add points
            this.profile.likedPosts.push(page.id);
            page.categories.forEach(cat => {
                const lowCat = cat.toLowerCase();
                this.profile.categoryScores[lowCat] = (this.profile.categoryScores[lowCat] || 0) + amount;
            });
            this.postsWithoutLike = 0;
        }

        await this.saveProfile();
        return !isLiked;
    }
    
    getLikeScore() {
        return 50 + this.postsWithoutLike * 4;
    }

    incrementScroll() {
        this.postsWithoutLike++;
    }
}
