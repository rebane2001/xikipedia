
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Plus, User, Trash2, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function ProfilesScreen() {
    const [profiles, setProfiles] = useState<string[]>(['default']);
    const [currentProfile, setCurrentProfile] = useState('default');
    const [profileNames, setProfilesNames] = useState<Record<string, string>>({ 'default': 'Default' });
    const router = useRouter();

    const loadData = async () => {
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings.profiles) setProfiles(settings.profiles);
            if (settings.profile) setCurrentProfile(settings.profile);

            const names: Record<string, string> = {};
            for (const id of settings.profiles || ['default']) {
                const pStr = await AsyncStorage.getItem(`xikipedia-profile-${id}`);
                if (pStr) {
                    names[id] = JSON.parse(pStr).profileName || id;
                } else {
                    names[id] = id === 'default' ? 'Default' : id;
                }
            }
            setProfilesNames(names);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const switchProfile = async (id: string) => {
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
        const settings = JSON.parse(settingsStr);
        settings.profile = id;
        await AsyncStorage.setItem('xikipedia-settings', JSON.stringify(settings));
        setCurrentProfile(id);
        Alert.alert("Profile Switched", "Restart the app to apply changes to the feed.");
    };

    const addProfile = () => {
        Alert.prompt("New Profile", "Enter profile name", async (name) => {
            if (name) {
                const id = Math.random().toString(36).slice(2);
                const newProfile = {
                    profileName: name,
                    categoryScores: { "given names": -1000, "surnames": -1000 },
                    seenPosts: [],
                    likedPosts: [],
                    timeSpentTotal: 0,
                };
                await AsyncStorage.setItem(`xikipedia-profile-${id}`, JSON.stringify(newProfile));
                
                const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
                const settings = JSON.parse(settingsStr);
                if (!settings.profiles) settings.profiles = ['default'];
                settings.profiles.push(id);
                await AsyncStorage.setItem('xikipedia-settings', JSON.stringify(settings));
                
                loadData();
            }
        });
    };

    const deleteProfile = async (id: string) => {
        if (id === 'default') return Alert.alert("Error", "Cannot delete default profile");
        
        Alert.alert("Delete Profile", `Are you sure you want to delete "${profileNames[id]}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => {
                await AsyncStorage.removeItem(`xikipedia-profile-${id}`);
                const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
                const settings = JSON.parse(settingsStr);
                settings.profiles = settings.profiles.filter((p: string) => p !== id);
                if (settings.profile === id) settings.profile = 'default';
                await AsyncStorage.setItem('xikipedia-settings', JSON.stringify(settings));
                loadData();
            }}
        ]);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Profiles</Text>
            <FlatList
                data={profiles}
                keyExtractor={item => item}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={[styles.profileCard, item === currentProfile && styles.activeProfile]}
                        onPress={() => switchProfile(item)}
                    >
                        <View style={styles.profileInfo}>
                            <View style={[styles.avatar, item === currentProfile && styles.activeAvatar]}>
                                <User size={20} color={item === currentProfile ? '#FFFFFF' : '#8899A6'} />
                            </View>
                            <Text style={[styles.profileName, item === currentProfile && styles.activeText]}>
                                {profileNames[item] || item}
                            </Text>
                        </View>
                        <View style={styles.actions}>
                            {item === currentProfile && <Check size={20} color="#1DA1F2" style={{ marginRight: 12 }} />}
                            {item !== 'default' && (
                                <TouchableOpacity onPress={() => deleteProfile(item)}>
                                    <Trash2 size={20} color="#E0245E" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </TouchableOpacity>
                )}
            />
            <TouchableOpacity style={styles.addButton} onPress={addProfile}>
                <Plus size={24} color="white" />
                <Text style={styles.addButtonText}>Create New Profile</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#15202B',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 24,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#192734',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#38444D',
    },
    activeProfile: {
        borderColor: '#1DA1F2',
        backgroundColor: '#1c2d3d',
    },
    profileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#253341',
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeAvatar: {
        backgroundColor: '#1DA1F2',
    },
    profileName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    activeText: {
        color: '#1DA1F2',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1DA1F2',
        padding: 16,
        borderRadius: 32,
        marginTop: 20,
        gap: 8,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    }
});
