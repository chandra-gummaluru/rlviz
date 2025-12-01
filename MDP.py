import networkx as nx
import numpy as np
import matplotlib.pyplot as plt

#Without Numpy arrays for now. 
#Will implement with Numpy arrays and add Exploration and Exploitation
#Will implement with Policy Function Next


class ActionState:
    def __init__(self, name: str):
        self.name = name
        self.position = (0, 0)
        self.value = 0

class StateState:
    def __init__(self, name: str):
        self.name = name
        self.position = (0, 0)
        self.value = 0

# class PolicyFunction: 
#     def __init__(self):

class MDP:
    def __init__(self):
        self.states = []
        self.actions = []
        self.transitions = {}  
        self.rewards = {} 
        self.gamma = 0.9

    def add_state(self, state):
        self.states.add(state)

    def add_action(self, action):
        self.actions.add(action)

    def set_transition(self, state, action, next_state, probability):
        if state not in self.states:
            self.add_state(state)

        if next_state not in self.states:
            self.add_state(next_state)
        if action not in self.actions:
            self.add_action(action)

        self.transitions[(state, action, next_state)] = probability

    def set_reward(self, state, action, next_state, reward):
        self.rewards[(state, action, next_state)] = reward
    
    def set_discount_factor(self, discount_factor):
        self.gamma = discount_factor

    def get_transition_prob(self, state, action, next_state):
        return self.transitions.get((state, action, next_state), 0.0)

    def get_reward(self, state, action, next_state):
        return self.rewards.get((state, action, next_state), 0.0)

    def get_possible_actions(self, state):
        possible_actions = set()
        for (s, a, _) in self.transitions.keys():
            if s == state:
                possible_actions.add(a)
        return list(possible_actions)

    def get_next_states(self, state, action):
        next_states = []
        for (s, a, next_s) in self.transitions.keys():
            if s == state and a == action:
                prob = self.transitions[(s, a, next_s)]
                if prob > 0:
                    next_states.append((next_s, prob))
        return next_states
    
    def get_states(self):
        return self.states
    
    def get_actions(self):
        return self.actions
    
    def get_discount_factor(self):
        return self.gamma
    
    def reset (self):
        self.states = []
        self.actions = []
        self.transitions = {}
        self.rewards = {}
        self.gamma = 0.9
    
    def __str__(self):
        s1 = f"MDP(States: {len(self.states)}, Actions: {len(self.actions)})"
        s2 = "\nTransitions:\n"
        for (state, action, next_state), prob in self.transitions.items():
            s2 += f"  P({next_state} | {state}, {action}) = {prob}\n"
        s3 = "Rewards:\n"
        for (state, action, next_state), reward in self.rewards.items():
            s3 += f"  R({state}, {action}, {next_state}) = {reward}\n"
        return s1 + s2 + s3
        
class VisualMDP(MDP):
    def __init__(self):
        super.__init__(self)
        self.actions = {}
