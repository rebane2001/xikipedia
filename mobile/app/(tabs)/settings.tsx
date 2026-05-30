
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { Trash2, RotateCcw, Info, ExternalLink } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
    const [storeData, setStoreData] = useState(true);
    const [openEnglish, setOpenEnglish] = useState(true);

    useEffect(() => {
        const load = async () => {
            const settingsStr = await AsyncStorage.getItem('xikipedia-settings');
            if (settingsStr) {
                const settings = JSON.parse(settingsStr);
                setStoreData(settings.storeData !== false);
                setOpenEnglish(settings.openMainWiki !== false);
            }
        };
        load();
    }, []);

    const updateSetting = async (key: string, value: any) => {
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
        const settings = JSON.parse(settingsStr);
        settings[key] = value;
        await AsyncStorage.setItem('xikipedia-settings', JSON.stringify(settings));
    };

    const resetAlgorithm = async () => {
        const settingsStr = await AsyncStorage.getItem('xikipedia-settings') || '{}';
        const settings = JSON.parse(settingsStr);
        const profileId = settings.profile || 'default';
        
        Alert.alert("Reset Algorithm", "This will reset all interests and statistics for the current profile. Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Reset", style: "destructive", onPress: async () => {
                await AsyncStorage.removeItem(`xikipedia-profile-${profileId}`);
                Alert.alert("Success", "Algorithm reset. Please restart the app.");
            }}
        ]);
    };

    const deleteAllData = async () => {
        Alert.alert("Delete All Data", "This will permanently delete all profiles and settings. This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete Everything", style: "destructive", onPress: async () => {
                const keys = await AsyncStorage.getAllKeys();
                const xikiKeys = keys.filter(k => k.startsWith('xikipedia-'));
                await AsyncStorage.multiRemove(xikiKeys);
                Alert.alert("Success", "All data deleted. Please restart the app.");
            }}
        ]);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.section}>
                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>Store Engagement Data</Text>
                        <Text style={styles.rowSubtitle}>Data stays on your device.</Text>
                    </View>
                    <Switch 
                        value={storeData} 
                        onValueChange={(val) => { setStoreData(val); updateSetting('storeData', val); }}
                        trackColor={{ false: '#38444D', true: '#1DA1F2' }}
                    />
                </View>

                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>Open in English Wikipedia</Text>
                        <Text style={styles.rowSubtitle}>Redirect Simple Wiki links.</Text>
                    </View>
                    <Switch 
                        value={openEnglish} 
                        onValueChange={(val) => { setOpenEnglish(val); updateSetting('openMainWiki', val); }}
                        trackColor={{ false: '#38444D', true: '#1DA1F2' }}
                    />
                </View>
            </View>

            <View style={styles.section}>
                <TouchableOpacity style={styles.button} onPress={() => Linking.openURL('https://github.com/rebane2001/xikipedia')}>
                    <Info size={20} color="#1DA1F2" />
                    <Text style={[styles.buttonText, { color: '#1DA1F2' }]}>About Xikipedia</Text>
                    <ExternalLink size={16} color="#1DA1F2" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.button} onPress={resetAlgorithm}>
                    <RotateCcw size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Reset Current Algorithm</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.button, styles.dangerButton]}
                    onPress={deleteAllData}
                >
                    <Trash2 size={20} color="#E0245E" />
                    <Text style={[styles.buttonText, { color: '#E0245E' }]}>Delete All App Data</Text>
                </TouchableOpacity>
            </View>
            
            <Text style={styles.footer}>Xikipedia Mobile v1.0.0</Text>
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
    section: {
        backgroundColor: '#192734',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#38444D',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#38444D',
    },
    rowTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    rowSubtitle: {
        color: '#8899A6',
        fontSize: 13,
        marginTop: 2,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    dangerButton: {
        marginTop: 8,
    },
    footer: {
        textAlign: 'center',
        color: '#8899A6',
        fontSize: 12,
        marginTop: 20,
        marginBottom: 40,
    }
});
