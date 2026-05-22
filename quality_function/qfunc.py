def q_func(state_action_transitions: dict[int, dict[int, tuple[int, int]]], 
           time: int, discount: float) -> list[dict[int, dict[int, float]]]:
    
    quality_func = [0] * (time + 1)

    for i in range(time):
        quality_func[i] = dict[int, dict[int, float]]

    # set everything in the (t + 1)th slot to 0

    for state in state_action_transitions:
        for action in state_action_transitions[state]:
            for resulting_state in state_action_transitions[state][action]:
                quality_func[time][state][action][resulting_state] = 0                

    for i in range(1, time + 1):
        # populate the table using a DP approach
        index = time + 1 - i

        for state in state_action_transitions:
            for action in state_action_transitions[state]:
                transition_table = state_action_transitions[state][action]
                ev = 0

                for transition in transition_table:
                    probability = transition_table[transition][0]

                    previous = quality_func[index - 1][state][action]
                    max_value = max(previous.values())

                    ev += probability * (transition_table[transition][1] + discount * max_value)

                quality_func[index][state][action] = ev

    return quality_func
       
                            

