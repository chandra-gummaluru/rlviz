def q_func(
    state_action_transitions: dict[int, dict[int, tuple[int, int]]], 
    time: int,
    discount: float
)-> list[dict[int, dict[int, float]]]:
    
    quality_func = [] 

    for _ in range(time + 1):
        timestep = {}

        for state in state_action_transitions:
                timestep[state] = {action: 0.0 for action in state_action_transitions[state]}
        quality_func.append(timestep)

    # Here, we will set everything in the (t + 1)th timeslot to zero, as the simulation
    # will end at that point. 

    for state in state_action_transitions:
        for action in state_action_transitions[state]:
            for resulting_state in state_action_transitions[state][action]:
                quality_func[time][state][action][resulting_state] = 0                

    for i in range(1, time + 1):
        # populate the table using a backwards DP approach 
        index = time - i

        for state in state_action_transitions:
            for action, transition_table in state_action_transitions[state].items():
                ev = 0.0

                for next_state, (probability, reward) in transition_table.items():
                    next_q = quality_func[index + 1].get(next_state, {}) # Bellman equation 

                    max_future = max(next_q.values()) if next_q else 0.0

                    ev += probability * (reward + discount * max_future)

                quality_func[index][state][action] = ev

    return quality_func
