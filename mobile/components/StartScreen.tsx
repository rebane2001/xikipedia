
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Switch } from 'react-native';
import { Image } from 'expo-image';

const DEFAULT_CATEGORIES = ["nature", "science", "animals", "anthropology", "places", "sociology", "art", "mathematics", "games", "technology", "music", "human sexuality"];

interface StartScreenProps {
    visible: boolean;
    onStart: (selectedCategories: string[]) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ visible, onStart }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const [isAdult, setIsAdult] = useState(false);

    const toggleCategory = (cat: string) => {
        setSelected(prev => 
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    return (
        <Modal visible={visible} animationType="slide">
            <View style={styles.container}>
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.title}>Xikipedia</Text>
                    <Text style={styles.subtitle}>by rebane2001</Text>
                    
                    <Text style={styles.description}>
                        Xikipedia is a pseudo social media feed that algorithmically shows you content from Simple Wikipedia. 
                        The algorithm runs locally and no data leaves your device.
                    </Text>

                    <Text style={styles.sectionTitle}>Pick some categories to get started</Text>
                    <View style={styles.chipContainer}>
                        {DEFAULT_CATEGORIES.map(cat => (
                            <TouchableOpacity 
                                key={cat} 
                                style={[styles.chip, selected.includes(cat) && styles.chipSelected]}
                                onPress={() => toggleCategory(cat)}
                            >
                                <Text style={[styles.chipText, selected.includes(cat) && styles.chipTextSelected]}>
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)} {selected.includes(cat) ? '−' : '+'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.warningContainer}>
                        <Text style={styles.warningText}>
                            Since the content and images shown is from random Wikipedia articles, you will likely see NSFW content.
                        </Text>
                        <View style={styles.switchRow}>
                            <Text style={styles.switchLabel}>I am an adult, continue</Text>
                            <Switch 
                                value={isAdult} 
                                onValueChange={setIsAdult}
                                trackColor={{ false: '#38444D', true: '#1DA1F2' }}
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.startBtn, !isAdult && styles.startBtnDisabled]}
                        disabled={!isAdult}
                        onPress={() => onStart(selected)}
                    >
                        <Text style={styles.startBtnText}>Start Doomscrolling</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#15202B',
    },
    content: {
        padding: 24,
        paddingTop: 60,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    subtitle: {
        fontSize: 16,
        color: '#8899A6',
        fontStyle: 'italic',
        marginBottom: 24,
    },
    description: {
        fontSize: 15,
        color: '#FFFFFF',
        lineHeight: 22,
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 16,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 40,
    },
    chip: {
        backgroundColor: '#192734',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#38444D',
    },
    chipSelected: {
        backgroundColor: '#FFFFFF',
        borderColor: '#FFFFFF',
    },
    chipText: {
        color: '#1DA1F2',
        fontWeight: '600',
    },
    chipTextSelected: {
        color: '#15202B',
    },
    warningContainer: {
        backgroundColor: 'rgba(224, 36, 94, 0.1)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#E0245E',
    },
    warningText: {
        color: '#E0245E',
        fontSize: 14,
        marginBottom: 16,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    switchLabel: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    startBtn: {
        backgroundColor: '#1DA1F2',
        padding: 16,
        borderRadius: 32,
        alignItems: 'center',
    },
    startBtnDisabled: {
        backgroundColor: '#555',
        opacity: 0.5,
    },
    startBtnText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    }
});
