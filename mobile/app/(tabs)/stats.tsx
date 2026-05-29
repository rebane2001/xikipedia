
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export default function StatsScreen() {
    const [stats, setStats] = useState({
        scrolled: 0,
        time: 0,
        topCategories: [] as [string, number][],
        bottomCategories: [] as [string, number][]
    });

    const loadStats = async () => {
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings');
        const settings = JSON.parse(settingsStr || '{}');
        const profileId = settings.profile || 'default';
        const profileStr = await AsyncStorage.getItem(`xikipedia-profile-${profileId}`);
        
        if (profileStr) {
            const profile = JSON.parse(profileStr);
            const scores = Object.entries(profile.categoryScores || {}) as [string, number][];
            const sorted = scores.filter(e => e[1] !== 0).sort((a, b) => b[1] - a[1]);
            
            setStats({
                scrolled: profile.seenPosts?.length || 0,
                time: profile.timeSpentTotal || 0,
                topCategories: sorted.slice(0, 20),
                bottomCategories: sorted.slice(-20).reverse()
            });
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [])
    );

    const formatTime = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const hours = Math.floor(mins / 60);
        if (hours > 0) return `${hours}h ${mins % 60}m`;
        return `${mins}m ${Math.floor((ms % 60000) / 1000)}s`;
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Your Engagement</Text>
            
            <View style={styles.row}>
                <View style={[styles.statCard, { flex: 1 }]}>
                    <Text style={styles.statLabel}>Articles Scrolled</Text>
                    <Text style={styles.statValue}>{stats.scrolled}</Text>
                </View>
                <View style={[styles.statCard, { flex: 1 }]}>
                    <Text style={styles.statLabel}>Time Spent</Text>
                    <Text style={styles.statValue}>{formatTime(stats.time)}</Text>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Top Categories</Text>
            {stats.topCategories.length > 0 ? (
                stats.topCategories.map(([cat, score]) => (
                    <View key={cat} style={styles.categoryRow}>
                        <Text style={styles.categoryName}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                        <Text style={styles.categoryScore}>+{Math.round(score)}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Keep scrolling to see your interests!</Text>
            )}

            {stats.bottomCategories.length > 0 && (
                <>
                    <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Least Interesting</Text>
                    {stats.bottomCategories.map(([cat, score]) => (
                        <View key={cat} style={styles.categoryRow}>
                            <Text style={styles.categoryName}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                            <Text style={[styles.categoryScore, { color: '#E0245E' }]}>{Math.round(score)}</Text>
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#15202B',
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        backgroundColor: '#192734',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#38444D',
    },
    statLabel: {
        color: '#8899A6',
        fontSize: 12,
        marginBottom: 4,
        textTransform: 'uppercase',
        fontWeight: 'bold',
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 16,
    },
    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#38444D',
    },
    categoryName: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    categoryScore: {
        color: '#1DA1F2',
        fontSize: 16,
        fontWeight: 'bold',
    },
    emptyText: {
        color: '#8899A6',
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 20,
    }
});
